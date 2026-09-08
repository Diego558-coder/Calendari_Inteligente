import { NextRequest, NextResponse } from 'next/server';
import { analyzeScheduleImageWithGemini } from '@/lib/gemini';
import { EventType } from '@/types/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, mimeType, scheduleType, apiKey } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { success: false, error: 'No se recibió ninguna imagen para analizar.' },
        { status: 400 }
      );
    }

    // Limpiar prefijo data:image/...;base64, si viene incluido
    let cleanBase64 = imageBase64;
    let detectedMime = mimeType || 'image/jpeg';

    if (imageBase64.includes(';base64,')) {
      const parts = imageBase64.split(';base64,');
      cleanBase64 = parts[1];
      const match = parts[0].match(/data:(.*?)$/);
      if (match) detectedMime = match[1];
    }

    const type: EventType = scheduleType === 'work' ? 'work' : 'university';

    const result = await analyzeScheduleImageWithGemini(
      cleanBase64,
      detectedMime,
      type,
      apiKey
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Error al procesar la imagen con Gemini' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      events: result.events,
      count: result.events.length,
    });
  } catch (err: any) {
    console.error('Error en /api/analyze-schedule:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

