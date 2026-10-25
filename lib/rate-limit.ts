import { NextResponse } from 'next/server';

const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();

  // Limpieza ocasional para que el mapa no crezca sin control
  if (hits.size > 5000) {
    hits.forEach((record, k) => {
      if (now > record.resetAt) hits.delete(k);
    });
  }

  const record = hits.get(key);
  if (!record || now > record.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  if (record.count >= limit) {
    return { allowed: false, remaining: 0, retryAfter: record.resetAt - now };
  }
  record.count++;
  return { allowed: true, remaining: limit - record.count };
}

/** IP real del cliente detrás del proxy de Vercel (x-forwarded-for puede traer varias) */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

/** Aplica el límite y devuelve la respuesta 429 lista si se superó */
export function enforceRateLimit(req: Request, scope: string, limit: number, message: string): NextResponse | null {
  const { allowed, retryAfter } = rateLimit(`${scope}:${clientIp(req)}`, limit, 60_000);
  if (allowed) return null;
  return NextResponse.json(
    { success: false, error: message },
    { status: 429, headers: { 'Retry-After': String(Math.ceil((retryAfter || 60_000) / 1000)) } }
  );
}
