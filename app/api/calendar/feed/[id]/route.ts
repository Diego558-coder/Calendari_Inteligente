import { NextRequest, NextResponse } from 'next/server';
import { generateICS } from '@/lib/schedule-utils';
import { ScheduleEvent } from '@/types/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLOUD_STORAGE_BASE = 'https://api.restful-api.dev/objects';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return new NextResponse('ID de suscripción requerido', { status: 400 });
    }

    const res = await fetch(`${CLOUD_STORAGE_BASE}/${id}`, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    });

    let events: ScheduleEvent[] = [];

    if (res.ok) {
      const record = await res.json();
      events = record?.data?.events || [];
    } else {
      console.warn(`No se encontró el feed de calendario para ID: ${id}`);
    }

    // Generar el contenido del calendario con alarma de 1 hora antes (-PT60M)
    const baseIcs = generateICS(events, 60);

    // Agregar directivas de autorefresco para Apple Calendar (1 hora)
    const enhancedIcs = baseIcs.replace(
      'X-WR-TIMEZONE:America/Bogota',
      'X-WR-TIMEZONE:America/Bogota\r\nX-PUBLISHED-TTL:PT1H\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H'
    );

    return new NextResponse(enhancedIcs, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="mihorario.ics"',
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (err: any) {
    console.error('Error generando feed de calendario:', err);
    return new NextResponse('Error al generar calendario', { status: 500 });
  }
}

