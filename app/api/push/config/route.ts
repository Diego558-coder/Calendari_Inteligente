import { NextResponse } from 'next/server';
import { isKvConfigured } from '@/lib/kv';
import { getVapidKeys } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Qué puede hacer el servidor con las notificaciones:
 * - publicKey: clave VAPID para suscribirse (null si no hay forma de firmar pushes)
 * - scheduled: puede enviar recordatorios con la app cerrada (requiere base de datos)
 */
export async function GET() {
  try {
    const vapid = await getVapidKeys();
    return NextResponse.json({
      publicKey: vapid?.publicKey ?? null,
      scheduled: Boolean(vapid) && isKvConfigured(),
      storage: isKvConfigured(),
    });
  } catch (err) {
    console.error('Error obteniendo configuración push:', err);
    return NextResponse.json({ publicKey: null, scheduled: false, storage: false, error: 'No se pudo leer la configuración' }, { status: 500 });
  }
}
