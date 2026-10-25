import { NextRequest, NextResponse } from 'next/server';
import { isKvConfigured } from '@/lib/kv';
import { getProfile } from '@/lib/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Indica si algún calendario (iPhone, Google…) ya consultó el feed de este perfil */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isKvConfigured()) return NextResponse.json({ enrolled: false, mode: 'static' });

  try {
    const profile = await getProfile((await params).id);
    if (!profile) return NextResponse.json({ enrolled: false, mode: 'live', found: false });

    return NextResponse.json({
      enrolled: Boolean(profile.feed),
      lastPing: profile.feed?.lastPing ?? null,
      client: profile.feed?.client ?? null,
      totalEvents: profile.events.length,
      updatedAt: profile.updatedAt,
      pushDevices: profile.push.length,
      mode: 'live',
      found: true,
    });
  } catch (err: any) {
    console.error('Error consultando estado del calendario:', err);
    return NextResponse.json({ enrolled: false, error: 'No se pudo consultar el estado' }, { status: 500 });
  }
}
