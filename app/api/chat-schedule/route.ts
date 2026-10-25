import { NextRequest, NextResponse } from 'next/server';
import { ChatHistoryMessage } from '@/types/schedule';
import { sanitizeEvents } from '@/lib/schedule-utils';
import { enforceRateLimit } from '@/lib/rate-limit';
import { AiError } from '@/lib/ai/errors';
import { NO_KEYS_MESSAGE, resolveKeys, runScheduleChat } from '@/lib/ai/schedule-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'chat', 20, 'Demasiadas peticiones al chat. Intenta en un minuto.');
  if (limited) return limited;

  try {
    const body = await req.json();
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : '';
    if (!message) return NextResponse.json({ success: false, error: 'Escribe una instrucción.' }, { status: 400 });

    const keys = resolveKeys(body);
    if (!keys.gemini && !keys.groq) {
      return NextResponse.json({ success: false, error: NO_KEYS_MESSAGE, code: 'NO_KEY' }, { status: 422 });
    }

    // Conservar los IDs originales: las acciones devueltas se aplican sobre ellos en el cliente
    const events = sanitizeEvents(body.events);
    const history: ChatHistoryMessage[] = Array.isArray(body.history)
      ? body.history
          .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.text === 'string')
          .map((m: any) => ({ role: m.role, text: m.text }))
      : [];

    const result = await runScheduleChat({
      message,
      history,
      events,
      timezone: typeof body.timezone === 'string' ? body.timezone : undefined,
      keys,
    });

    return NextResponse.json({
      success: true,
      reply: result.reply,
      actions: result.actions,
      provider: result.provider,
      model: result.model,
      warnings: result.warnings,
    });
  } catch (error: any) {
    if (error instanceof AiError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.code === 'QUOTA' ? 429 : error.code === 'INVALID_KEY' || error.code === 'NO_KEY' ? 422 : 502 }
      );
    }
    console.error('Error en /api/chat-schedule:', error);
    return NextResponse.json({ success: false, error: 'Error interno del asistente. Intenta de nuevo.' }, { status: 500 });
  }
}
