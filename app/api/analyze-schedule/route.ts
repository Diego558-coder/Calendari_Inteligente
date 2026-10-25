import { NextRequest, NextResponse } from 'next/server';
import { EventType } from '@/types/schedule';
import { sanitizeEvents } from '@/lib/schedule-utils';
import { enforceRateLimit } from '@/lib/rate-limit';
import { AiError, aiErrorResponse } from '@/lib/ai/errors';
import { extractSchedule, NO_KEYS_MESSAGE, resolveKeys, ScheduleSource } from '@/lib/ai/schedule-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Leer una imagen con detalle puede tardar; el plan gratuito de Vercel (Fluid compute) permite hasta 300 s
export const maxDuration = 120;

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];

function cleanString(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

/**
 * Extrae un horario a partir de una imagen y/o texto. Acepta indicaciones del usuario
 * ("las clases son los cuadros azules") y correcciones sobre una lista anterior.
 */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'analyze', 12, 'Demasiadas peticiones. Intenta en un minuto.');
  if (limited) return limited;

  try {
    const body = await req.json();
    const source: ScheduleSource = {
      text: cleanString(body.text, 8000),
      instructions: cleanString(body.instructions, 1000),
      correction: cleanString(body.correction, 1000),
      previous: body.correction ? sanitizeEvents(body.previous, 'personal', 200) : undefined,
    };

    if (typeof body.imageBase64 === 'string' && body.imageBase64) {
      // Limpiar prefijo data:image/...;base64, si viene incluido
      let base64 = body.imageBase64;
      let mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg';
      if (base64.includes(';base64,')) {
        const parts = base64.split(';base64,');
        base64 = parts[1];
        const match = parts[0].match(/data:(.*?)$/);
        if (match) mimeType = match[1];
      }
      if (!ALLOWED_MIME.includes(mimeType)) mimeType = 'image/jpeg';

      // ~6 MB de base64 ≈ 4.5 MB de imagen: el cliente ya la comprime, esto es solo una protección
      if (base64.length > 6_000_000) {
        return NextResponse.json(
          { success: false, error: 'La imagen es demasiado grande. Prueba con una captura o una foto más pequeña.' },
          { status: 413 }
        );
      }
      source.image = { base64, mimeType };
    }

    if (!source.image && (!source.text || source.text.length < 8)) {
      return NextResponse.json(
        { success: false, error: 'Sube una imagen o escribe tu horario en texto para analizarlo.' },
        { status: 400 }
      );
    }

    const keys = resolveKeys(body);
    if (!keys.gemini && !keys.groq) {
      return NextResponse.json({ success: false, error: NO_KEYS_MESSAGE, code: 'NO_KEY' }, { status: 422 });
    }

    const type: EventType = body.scheduleType === 'work' ? 'work' : 'university';
    const result = await extractSchedule({ source, scheduleType: type, keys });

    const diagnostics = { returned: result.returned, discardedSample: result.discardedSample, rawPreview: result.rawPreview };
    if (result.events.length === 0 && !source.correction) {
      return NextResponse.json(
        {
          success: false,
          error: result.note || result.warnings.at(-1) || 'No se detectaron clases ni turnos. Intenta con una imagen más clara o agrega indicaciones para la IA.',
          provider: result.provider,
          model: result.model,
          ...diagnostics,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      events: result.events,
      count: result.events.length,
      provider: result.provider,
      model: result.model,
      warnings: result.warnings,
      note: result.note,
      ...diagnostics,
    });
  } catch (err: any) {
    if (err instanceof AiError) {
      const { body, status } = aiErrorResponse(err);
      return NextResponse.json(body, { status });
    }
    console.error('Error en /api/analyze-schedule:', err);
    return NextResponse.json(
      { success: false, error: 'Error interno al analizar el horario. Intenta de nuevo.' },
      { status: 500 }
    );
  }
}
