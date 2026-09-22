import { NextRequest, NextResponse } from 'next/server';
import { EventType, ScheduleEvent } from '@/types/schedule';
import { normalizeDay } from '@/lib/schedule-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatAction = {
  type: 'add' | 'update' | 'delete' | 'none';
  eventId?: string;
  matchTitle?: string;
  event?: Partial<ScheduleEvent>;
};

const actionSchema = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    actions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['add', 'update', 'delete', 'none'] },
          eventId: { type: 'STRING' },
          matchTitle: { type: 'STRING' },
          event: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              type: { type: 'STRING', enum: ['university', 'work', 'personal'] },
              dayOfWeek: { type: 'STRING' },
              startTime: { type: 'STRING' },
              endTime: { type: 'STRING' },
              location: { type: 'STRING' },
              teacher: { type: 'STRING' },
              notes: { type: 'STRING' },
            },
          },
        },
        required: ['type'],
      },
    },
  },
  required: ['reply', 'actions'],
};

function parseJson(text: string): { reply: string; actions: ChatAction[] } {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('La respuesta de IA no tiene un formato válido.');
    return JSON.parse(match[0]);
  }
}

function cleanEvent(event: Partial<ScheduleEvent> = {}): Partial<ScheduleEvent> {
  return {
    ...(event.title ? { title: String(event.title).trim() } : {}),
    ...(event.type ? { type: event.type as EventType } : {}),
    ...(event.dayOfWeek ? { dayOfWeek: normalizeDay(String(event.dayOfWeek)) } : {}),
    ...(event.startTime ? { startTime: String(event.startTime).trim() } : {}),
    ...(event.endTime ? { endTime: String(event.endTime).trim() } : {}),
    ...(event.location ? { location: String(event.location).trim() } : {}),
    ...(event.teacher ? { teacher: String(event.teacher).trim() } : {}),
    ...(event.notes ? { notes: String(event.notes).trim() } : {}),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const events = Array.isArray(body.events) ? body.events as ScheduleEvent[] : [];
    const apiKey = typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : process.env.GEMINI_API_KEY;

    if (!message) return NextResponse.json({ success: false, error: 'Escribe una instrucción.' }, { status: 400 });
    if (!apiKey) return NextResponse.json({ success: false, error: 'Configura la clave de Gemini en Ajustes para usar el chat.' }, { status: 422 });

    const prompt = `Eres el asistente de agenda de MiHorario. Responde en español y devuelve SOLO JSON válido.
El usuario quiere crear, corregir, modificar o eliminar actividades. Interpreta días en español y horas como 2 pm = 14:00.
Si falta la hora de fin, usa una duración de 1 hora para una clase personal y responde indicando esa suposición.
Para actualizar o borrar, usa eventId si coincide con el listado; si no, usa matchTitle con el título más probable. Si hay ambigüedad real, no ejecutes acciones y pide aclaración usando type none.
Tipos: university para clase/universidad, work para trabajo/turno, personal para cita o actividad personal.
Cada evento debe usar dayOfWeek entre lunes, martes, miercoles, jueves, viernes, sabado, domingo; horas HH:mm.
Eventos actuales:
${JSON.stringify(events)}
Pedido del usuario: ${message}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt }] },
        contents: [{ parts: [{ text: message }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: actionSchema },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({ success: false, error: `Gemini no pudo procesar el pedido (${response.status}).`, detail }, { status: 502 });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini no devolvió una respuesta.');
    const parsed = parseJson(text);

    return NextResponse.json({
      success: true,
      reply: parsed.reply || 'Listo.',
      actions: (parsed.actions || []).map((action) => ({
        ...action,
        ...(action.event ? { event: cleanEvent(action.event) } : {}),
      })),
    });
  } catch (error: any) {
    console.error('Error en /api/chat-schedule:', error);
    return NextResponse.json({ success: false, error: error.message || 'No se pudo procesar el mensaje.' }, { status: 500 });
  }
}
