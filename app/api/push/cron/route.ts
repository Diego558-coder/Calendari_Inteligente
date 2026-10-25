import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { enforceRateLimit } from '@/lib/rate-limit';
import { isKvConfigured } from '@/lib/kv';
import { runReminderCron } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // sin secreto configurado el endpoint es público (solo envía avisos pendientes, no expone datos)

  const header = req.headers.get('authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : req.nextUrl.searchParams.get('secret') || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Envía los recordatorios que tocan ahora. Debe llamarse cada 1–5 minutos desde un programador
 * externo gratuito (cron-job.org o GitHub Actions; ver README). Es idempotente: llamarlo de más no duplica avisos.
 */
async function handle(req: NextRequest) {
  const limited = enforceRateLimit(req, 'cron', 30, 'Demasiadas ejecuciones del cron.');
  if (limited) return limited;

  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  }
  if (!isKvConfigured()) {
    return NextResponse.json({ success: false, error: 'Falta conectar la base de datos (Upstash Redis).' }, { status: 503 });
  }

  try {
    const startedAt = Date.now();
    const stats = await runReminderCron();
    return NextResponse.json({ success: true, ...stats, ms: Date.now() - startedAt });
  } catch (err: any) {
    console.error('Error en cron de recordatorios:', err);
    return NextResponse.json({ success: false, error: 'Error ejecutando recordatorios' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
