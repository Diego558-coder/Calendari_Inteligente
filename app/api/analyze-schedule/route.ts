import { NextRequest, NextResponse } from 'next/server';
import { EventType } from '@/types/schedule';
import { enforceRateLimit } from '@/lib/rate-limit';
import { AiError } from '@/lib/ai/errors';
import { extractScheduleFromImage, NO_KEYS_MESSAGE, resolveKeys } from '@/lib/ai/schedule-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Los modelos con visión pueden tardar; 60 s es el máximo del plan gratuito de Vercel
export const maxDuration = 60;

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'analyze', 10, 'Demasiadas peticiones. Intenta en un minuto.');
  if (limited) return limited;

  try {
    const body = await req.json();
    const { imageBase64, mimeType, scheduleType } = body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json(
        { success: false, error: 'No se recibió ninguna imagen para analizar.' },
        { status: 400 }
      );
    }

    // Limpiar prefijo data:image/...;base64, si viene incluido
    let cleanBase64 = imageBase64;
    let detectedMime = typeof mimeType === 'string' ? mimeType : 'image/jpeg';

    if (imageBase64.includes(';base64,')) {
      const parts = imageBase64.split(';base64,');
      cleanBase64 = parts[1];
      const match = parts[0].match(/data:(.*?)$/);
      if (match) detectedMime = match[1];
    }
    if (!ALLOWED_MIME.includes(detectedMime)) detectedMime = 'image/jpeg';

    // ~6 MB de base64 ≈ 4.5 MB de imagen: el cliente ya la comprime, esto es solo una protección
    if (cleanBase64.length > 6_000_000) {
      return NextResponse.json(
        { success: false, error: 'La imagen es demasiado grande. Prueba con una captura o una foto más pequeña.' },
        { status: 413 }
      );
    }

    const keys = resolveKeys(body);
    if (!keys.gemini && !keys.groq) {
      return NextResponse.json({ success: false, error: NO_KEYS_MESSAGE, code: 'NO_KEY' }, { status: 422 });
    }

    const type: EventType = scheduleType === 'work' ? 'work' : 'university';
    const result = await extractScheduleFromImage({ imageBase64: cleanBase64, mimeType: detectedMime, scheduleType: type, keys });

    if (result.events.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: result.warnings.at(-1) || 'No se detectaron clases ni turnos en la foto. Intenta con una imagen más clara, recta y bien iluminada.',
          provider: result.provider,
          model: result.model,
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
    });
  } catch (err: any) {
    if (err instanceof AiError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.code === 'QUOTA' ? 429 : err.code === 'INVALID_KEY' || err.code === 'NO_KEY' ? 422 : 502 }
      );
    }
    console.error('Error en /api/analyze-schedule:', err);
    return NextResponse.json(
      { success: false, error: 'Error interno al analizar la imagen. Intenta de nuevo.' },
      { status: 500 }
    );
  }
}
