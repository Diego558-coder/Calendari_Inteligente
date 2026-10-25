import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { isValidSubscription, sendPush } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Envía una notificación de prueba al dispositivo para comprobar que todo el circuito funciona */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'push-test', 5, 'Espera un minuto antes de enviar otra prueba.');
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  if (!isValidSubscription(body.subscription)) {
    return NextResponse.json({ success: false, error: 'Suscripción de notificaciones no válida.' }, { status: 400 });
  }

  const result = await sendPush(body.subscription, {
    title: '🔔 ¡Notificaciones activadas!',
    body: 'Así te avisará MiHorario antes de cada clase o turno.',
    tag: 'mh-test',
    url: '/?tab=notifications',
  });

  if (!result.ok) {
    console.warn('Fallo en push de prueba:', result.status, result.error);
    return NextResponse.json(
      {
        success: false,
        gone: result.gone,
        error: result.gone
          ? 'Esta suscripción ya no es válida. Desactiva y vuelve a activar las notificaciones.'
          : 'El servicio de notificaciones del navegador rechazó el envío. Intenta de nuevo.',
      },
      { status: 502 }
    );
  }
  return NextResponse.json({ success: true });
}
