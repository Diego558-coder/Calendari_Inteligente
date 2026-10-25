import { NextRequest, NextResponse } from 'next/server';
import { sanitizeEvents } from '@/lib/schedule-utils';
import { safeTimezone } from '@/lib/timezone';
import { enforceRateLimit } from '@/lib/rate-limit';
import { isKvConfigured } from '@/lib/kv';
import {
  clampAlarmMinutes,
  createProfile,
  encodeStaticToken,
  getProfile,
  publicProfileData,
  saveProfile,
  verifyWriteKey,
} from '@/lib/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Guarda el horario en el servidor para el feed del calendario y las notificaciones push.
 *
 * - Con Upstash Redis configurado ("live"): crea/actualiza un perfil y devuelve su ID y clave de escritura.
 * - Sin base de datos ("static"): devuelve un token con el horario comprimido para el enlace del calendario.
 */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'sync', 40, 'Demasiadas sincronizaciones. Intenta en un minuto.');
  if (limited) return limited;

  try {
    const body = await req.json();
    if (!Array.isArray(body.events)) {
      return NextResponse.json({ success: false, error: 'Lista de eventos no válida.' }, { status: 400 });
    }

    const events = sanitizeEvents(body.events);
    const timezone = safeTimezone(body.timezone);
    const alarmMinutes = clampAlarmMinutes(body.alarmMinutes);
    const updatedAt = Number.isFinite(body.updatedAt) ? Math.min(Number(body.updatedAt), Date.now() + 60_000) : Date.now();

    if (!isKvConfigured()) {
      return NextResponse.json({
        success: true,
        mode: 'static',
        feedToken: encodeStaticToken(events, timezone, alarmMinutes),
      });
    }

    const existing = await getProfile(body.profileId);
    if (existing && verifyWriteKey(existing, body.writeKey)) {
      // Otro dispositivo vinculado guardó cambios más recientes: el cliente debe adoptarlos
      if (existing.updatedAt > updatedAt && !body.force) {
        return NextResponse.json({
          success: true,
          mode: 'live',
          profileId: existing.id,
          conflict: true,
          ...publicProfileData(existing),
        });
      }

      existing.events = events;
      existing.timezone = timezone;
      existing.alarmMinutes = alarmMinutes;
      existing.updatedAt = updatedAt;
      await saveProfile(existing);
      return NextResponse.json({ success: true, mode: 'live', profileId: existing.id, updatedAt });
    }

    const { profile, writeKey } = await createProfile({ events, timezone, alarmMinutes, updatedAt });
    return NextResponse.json({ success: true, mode: 'live', profileId: profile.id, writeKey, updatedAt, created: true });
  } catch (err: any) {
    console.error('Error en /api/sync:', err);
    return NextResponse.json({ success: false, error: 'No se pudo sincronizar el horario con el servidor.' }, { status: 500 });
  }
}
