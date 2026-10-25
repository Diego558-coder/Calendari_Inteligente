import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { isKvConfigured } from '@/lib/kv';
import { getProfile, Profile, saveProfile, verifyWriteKey } from '@/lib/profile';
import { isValidSubscription } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_DEVICES_PER_PROFILE = 10;

async function loadAuthorizedProfile(body: any): Promise<{ profile: Profile } | { error: NextResponse }> {
  if (!isKvConfigured()) return { error: NextResponse.json({ success: false, error: 'El servidor no tiene base de datos para programar avisos.', code: 'NO_STORAGE' }, { status: 503 }) };
  const profile = await getProfile(body.profileId);
  if (!profile || !verifyWriteKey(profile, body.writeKey)) {
    return { error: NextResponse.json({ success: false, error: 'Tu horario no está sincronizado todavía. Intenta de nuevo.', code: 'NOT_FOUND' }, { status: 404 }) };
  }
  return { profile };
}

/** Asocia la suscripción push de este dispositivo al horario guardado en el servidor */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'push-sub', 20, 'Demasiadas peticiones. Intenta en un minuto.');
  if (limited) return limited;

  try {
    const body = await req.json();
    if (!isValidSubscription(body.subscription)) {
      return NextResponse.json({ success: false, error: 'Suscripción de notificaciones no válida.' }, { status: 400 });
    }

    const auth = await loadAuthorizedProfile(body);
    if ('error' in auth) return auth.error;
    const { profile } = auth;

    const { endpoint, keys, expirationTime } = body.subscription;
    const others = profile.push.filter((sub) => sub.endpoint !== endpoint);
    profile.push = [
      ...others,
      {
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        expirationTime: typeof expirationTime === 'number' ? expirationTime : null,
        addedAt: Date.now(),
        device: typeof body.device === 'string' ? body.device.slice(0, 80) : undefined,
      },
    ].slice(-MAX_DEVICES_PER_PROFILE);

    await saveProfile(profile);
    return NextResponse.json({ success: true, devices: profile.push.length });
  } catch (err) {
    console.error('Error en /api/push/subscribe:', err);
    return NextResponse.json({ success: false, error: 'No se pudo activar las notificaciones.' }, { status: 500 });
  }
}

/** Quita la suscripción de este dispositivo */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const auth = await loadAuthorizedProfile(body);
    if ('error' in auth) return auth.error;
    const { profile } = auth;

    profile.push = profile.push.filter((sub) => sub.endpoint !== body.endpoint);
    await saveProfile(profile);
    return NextResponse.json({ success: true, devices: profile.push.length });
  } catch (err) {
    console.error('Error en DELETE /api/push/subscribe:', err);
    return NextResponse.json({ success: false, error: 'No se pudo desactivar las notificaciones.' }, { status: 500 });
  }
}
