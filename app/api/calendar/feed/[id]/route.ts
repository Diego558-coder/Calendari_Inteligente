import { NextRequest, NextResponse } from 'next/server';
import { generateICS } from '@/lib/schedule-utils';
import { isKvConfigured } from '@/lib/kv';
import { decodeStaticToken, describeCalendarClient, getProfile, saveProfile, STATIC_TOKEN_PREFIX } from '@/lib/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Registrar la conexión del calendario como máximo cada 30 min para ahorrar escrituras
const PING_THROTTLE_MS = 30 * 60 * 1000;

/**
 * Feed iCalendar al que se suscribe Apple Calendar / Google Calendar.
 * Acepta `/api/calendar/feed/<perfil>.ics` (se actualiza solo) o `/api/calendar/feed/s_<token>.ics` (copia fija).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = decodeURIComponent((await params).id || '').replace(/\.ics$/i, '');
    if (!id) return new NextResponse('ID de suscripción requerido', { status: 400 });

    let ics: string;

    if (id.startsWith(STATIC_TOKEN_PREFIX)) {
      const data = decodeStaticToken(id);
      if (!data) return new NextResponse('Enlace de calendario no válido', { status: 404 });
      ics = generateICS(data.events, { alarmMinutes: data.alarmMinutes, timezone: data.timezone });
    } else {
      if (!isKvConfigured()) return new NextResponse('El servidor no tiene base de datos configurada', { status: 503 });
      const profile = await getProfile(id);
      if (!profile) return new NextResponse('Calendario no encontrado', { status: 404 });

      ics = generateICS(profile.events, { alarmMinutes: profile.alarmMinutes, timezone: profile.timezone });

      const client = describeCalendarClient(req.headers.get('user-agent') || '');
      if (client && (!profile.feed || Date.now() - profile.feed.lastPing > PING_THROTTLE_MS || profile.feed.client !== client)) {
        profile.feed = { lastPing: Date.now(), client };
        await saveProfile(profile).catch((error) => console.warn('No se pudo registrar la conexión del calendario:', error));
      }
    }

    return new NextResponse(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="mihorario.ics"',
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('Error generando feed de calendario:', err);
    return new NextResponse('Error al generar calendario', { status: 500 });
  }
}
