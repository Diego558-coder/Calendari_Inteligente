import { NextRequest, NextResponse } from 'next/server';
import { ScheduleEvent } from '@/types/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLOUD_STORAGE_BASE = 'https://api.restful-api.dev/objects';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { syncId, events } = body as { syncId?: string; events: ScheduleEvent[] };

    if (!Array.isArray(events)) {
      return NextResponse.json(
        { success: false, error: 'Lista de eventos no válida.' },
        { status: 400 }
      );
    }

    // Si ya tenemos un syncId, intentar actualizar el objeto existente
    if (syncId && syncId.trim().length > 0) {
      try {
        const updateResp = await fetch(`${CLOUD_STORAGE_BASE}/${syncId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'MiHorario_Sync',
            data: {
              events,
              updatedAt: Date.now(),
            },
          }),
        });

        if (updateResp.ok) {
          return NextResponse.json({
            success: true,
            syncId,
            message: 'Horarios actualizados en la nube.',
          });
        }
      } catch (e) {
        console.warn('Error al actualizar por ID, creando nuevo registro:', e);
      }
    }

    // Crear un nuevo registro en la nube para la suscripción
    const createResp = await fetch(CLOUD_STORAGE_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'MiHorario_Sync',
        data: {
          events,
          createdAt: Date.now(),
        },
      }),
    });

    if (!createResp.ok) {
      throw new Error(`Error en servidor de almacenamiento (${createResp.status})`);
    }

    const createdData = await createResp.json();
    const newSyncId = createdData.id;

    return NextResponse.json({
      success: true,
      syncId: newSyncId,
      message: 'Suscripción de calendario creada exitosamente.',
    });
  } catch (err: any) {
    console.error('Error en /api/calendar/sync:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error al sincronizar horarios' },
      { status: 500 }
    );
  }
}

