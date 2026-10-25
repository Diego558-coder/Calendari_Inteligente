import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolveKeys, serverKeyStatus, testProvider } from '@/lib/ai/schedule-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Indica qué IA tiene clave configurada en el servidor (variables de entorno de Vercel) */
export async function GET() {
  return NextResponse.json({ server: serverKeyStatus() });
}

/** Prueba real de las claves: usado por el botón "Probar conexión" de Ajustes */
export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, 'ai-test', 6, 'Espera un minuto antes de volver a probar.');
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const keys = resolveKeys(body);
  const server = serverKeyStatus();
  const hasUserKey = (value: unknown) => typeof value === 'string' && value.trim().length >= 20;

  const [gemini, groq] = await Promise.all([
    testProvider('gemini', keys.gemini, hasUserKey(body.geminiKey) ? 'user' : server.gemini ? 'server' : 'none'),
    testProvider('groq', keys.groq, hasUserKey(body.groqKey) ? 'user' : server.groq ? 'server' : 'none'),
  ]);

  return NextResponse.json({ gemini, groq });
}
