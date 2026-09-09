import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLOUD_STORAGE_BASE = 'https://api.restful-api.dev/objects';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ enrolled: false });
    }

    const res = await fetch(`${CLOUD_STORAGE_BASE}/${id}`, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      return NextResponse.json({ enrolled: false });
    }

    const record = await res.json();
    const data = record?.data || {};

    return NextResponse.json({
      enrolled: Boolean(data.enrolled || data.lastSubscriberPing),
      lastPing: data.lastSubscriberPing || null,
      userAgent: data.subscriberUserAgent || null,
      totalEvents: data.events?.length || 0,
      updatedAt: data.updatedAt || null,
    });
  } catch (err: any) {
    return NextResponse.json({ enrolled: false, error: err.message });
  }
}

