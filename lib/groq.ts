import { EventType, ScheduleEvent } from '@/types/schedule';
import { minutesToTime, normalizeDay, timeToMinutes } from '@/lib/schedule-utils';

export interface GroqChatResult {
  success: boolean;
  reply: string;
  actions: Array<{
    type: 'add' | 'update' | 'delete' | 'none';
    eventId?: string;
    matchTitle?: string;
    event?: Partial<ScheduleEvent>;
  }>;
  error?: string;
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // Modelo actualizado (llama-3.1-70b fue descontinuado)

const actionSchema = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['add', 'update', 'delete', 'none'] },
          eventId: { type: 'string' },
          matchTitle: { type: 'string' },
          event: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              type: { type: 'string', enum: ['university', 'work', 'personal'] },
              dayOfWeek: { type: 'string' },
              startTime: { type: 'string' },
              endTime: { type: 'string' },
              location: { type: 'string' },
              teacher: { type: 'string' },
              notes: { type: 'string' },
            },
            required: ['title', 'type', 'dayOfWeek', 'startTime'],
          },
        },
        required: ['type'],
      },
    },
  },
  required: ['reply', 'actions'],
};

function parseJson(text: string): { reply: string; actions: Array<any> } {
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

/**
 * Llama a Groq (Llama 3.1 70B) para procesar el chat de agenda
 * Gratis: 14,400 req/día, muy rápido (LPUs)
 */
export async function analyzeScheduleChatWithGroq(
  message: string,
  events: ScheduleEvent[],
  apiKey: string
): Promise<GroqChatResult> {
  if (!apiKey || !apiKey.trim()) {
    return {
      success: false,
      reply: '',
      actions: [],
      error: 'No se encontró la clave de API de Groq. Configúrala en Ajustes.',
    };
  }

  const cleanKey = apiKey.trim();

  const systemPrompt = `Eres el asistente de agenda de MiHorario. Responde en español y devuelve SOLO JSON válido.
El usuario quiere crear, corregir, modificar o eliminar actividades. Interpreta días en español y horas como 2 pm = 14:00.
Si falta la hora de fin, usa una duración de 1 hora para una clase personal y responde indicando esa suposición.
Para actualizar o borrar, usa eventId si coincide con el listado; si no, usa matchTitle con el título más probable. Si hay ambigüedad real, no ejecutes acciones y pide aclaración usando type none.
Tipos: university para clase/universidad, work para trabajo/turno, personal para cita o actividad personal.
Cada evento debe usar dayOfWeek entre lunes, martes, miercoles, jueves, viernes, sabado, domingo; horas HH:mm.
Eventos actuales:
${JSON.stringify(events)}
Pedido del usuario: ${message}`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API error:', response.status, errorText);
      
      // Si es error de rate limit o auth, propagar para fallback a Gemini
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        throw new Error(`GROQ_${response.status}`);
      }
      
      return {
        success: false,
        reply: '',
        actions: [],
        error: `Error de Groq (${response.status}): ${errorText}`,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Groq no devolvió contenido');
    }

    const parsed = parseJson(content);

    return {
      success: true,
      reply: parsed.reply || 'Listo.',
      actions: (parsed.actions || []).map((action: any) => {
        if (!action.event) return action;
        const event = cleanEvent(action.event);
        if (action.type === 'add' && event.startTime && !event.endTime) {
          event.endTime = minutesToTime(timeToMinutes(event.startTime) + 60);
        }
        return { ...action, event };
      }),
    };
  } catch (error: any) {
    console.error('Error en Groq chat:', error);
    
    // Propagar errores específicos para que el caller haga fallback
    if (error.message?.startsWith('GROQ_')) {
      throw error;
    }
    
    return {
      success: false,
      reply: '',
      actions: [],
      error: error.message || 'No se pudo procesar el mensaje con Groq',
    };
  }
}