import { NextRequest, NextResponse } from 'next/server';
import { EventType, ScheduleEvent } from '@/types/schedule';
import { minutesToTime, normalizeDay, timeToMinutes } from '@/lib/schedule-utils';
import { rateLimit } from '@/lib/rate-limit';
import { analyzeScheduleChatWithGroq } from '@/lib/groq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChatAction {
  type: 'add' | 'update' | 'delete' | 'none';
  eventId?: string;
  matchTitle?: string;
  event?: Partial<ScheduleEvent>;
}

export async function POST(req: NextRequest) {
  // Rate limiting: 20 requests per minute per IP
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const { allowed, remaining, retryAfter } = rateLimit(`chat:${ip}`, 20, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: 'Demasiadas peticiones al chat. Intenta en un minuto.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((retryAfter || 60000) / 1000)) } }
    );
  }

  try {
    const body = await req.json();
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const events = Array.isArray(body.events) ? body.events as ScheduleEvent[] : [];
    const groqKey = typeof body.groqKey === 'string' && body.groqKey.trim() ? body.groqKey.trim() : process.env.GROQ_API_KEY;

    if (!message) return NextResponse.json({ success: false, error: 'Escribe una instrucción.' }, { status: 400 });
    
    if (!groqKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'Configura tu clave de Groq en Ajustes (gratis en console.groq.com).' 
      }, { status: 422 });
    }

    // SOLO GROQ - Llama 3.1 70B
    try {
      const { analyzeScheduleChatWithGroq } = await import('@/lib/groq');
      const result = await analyzeScheduleChatWithGroq(message, events, groqKey);
      
      if (result.success) {
        return NextResponse.json({
          success: true,
          reply: result.reply,
          actions: result.actions,
          provider: 'groq',
        });
      }
      
      // Si Groq falla, devolver error específico
      return NextResponse.json({ 
        success: false, 
        error: result.error || 'Error en Groq' 
      }, { status: 502 });
      
    } catch (groqError: any) {
      console.error('Error en Groq:', groqError);
      return NextResponse.json({ 
        success: false, 
        error: groqError.message || 'Error conectando con Groq' 
      }, { status: 502 });
    }

  } catch (error: any) {
    console.error('Error en /api/chat-schedule:', error);
    return NextResponse.json({ success: false, error: error.message || 'Error interno' }, { status: 500 });
  }
}