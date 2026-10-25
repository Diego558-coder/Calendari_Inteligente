import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { isKvConfigured } from '@/lib/kv';
import { decodeStaticToken, getProfile, publicProfileData, verifyWriteKey } from '@/lib/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Descarga el horario guardado en el servidor. Se usa al vincular otro dispositivo
 * (enlace o QR) y al abrir la app para traer cambios hechos en otro equipo.
 * Va por POST para que la clave de escritura no quede en los registros de URLs.
 */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'pull', 30, 'Demasiadas peticiones. Intenta en un minuto.');
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));

  // Enlace de importación del modo sin base de datos
  if (typeof body.token === 'string') {
    const data = decodeStaticToken(body.token);
    if (!data) return NextResponse.json({ success: false, error: 'El enlace de importación no es válido.' }, { status: 400 });
    return NextResponse.json({ success: true, mode: 'static', ...data, updatedAt: Date.now() });
  }

  if (!isKvConfigured()) {
    return NextResponse.json({ success: false, error: 'El servidor no tiene base de datos configurada.' }, { status: 503 });
  }

  const profile = await getProfile(body.profileId);
  if (!profile || !verifyWriteKey(profile, body.writeKey)) {
    return NextResponse.json({ success: false, error: 'El enlace de vinculación no es válido o expiró.', code: 'NOT_FOUND' }, { status: 404 });
  }

  return NextResponse.json({ success: true, mode: 'live', profileId: profile.id, ...publicProfileData(profile) });
}
