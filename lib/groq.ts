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

// Modelos en orden de preferencia (estables y disponibles)
const GROQ_MODELS = [
  'llama-3.1-8b-instant',      // Rápido, siempre disponible, 8B params
  'llama3-8b-8192',            // Alias estable
  'llama-3.1-70b-versatile',   // Si vuelve a estar disponible
  'mixtral-8x7b-32768',        // Alternativa Mixture of Experts
  'gemma2-9b-it',              // Google Gemma, buena alternativa
];

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
 * Llama a Groq con fallback automático entre modelos disponibles
 * Prueba modelos en orden hasta que uno funcione
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

  // Probar modelos en orden hasta que uno funcione
  for (const model of GROQ_MODELS) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
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
        console.warn(`Groq model ${model} failed (${response.status}):`, errorText);
        
        // Si es 404 (modelo no existe) o 400 (modelo descontinuado), probar siguiente
        if (response.status === 404 || response.status === 400) {
          console.log(`Model ${model} not available, trying next...`);
          continue;
        }
        
        // Si es error de auth/rate limit, propagar
        if (response.status === 401 || response.status === 403 || response.status === 429) {
          throw new Error(`GROQ_${response.status}`);
        }
        
        // Otros errores, probar siguiente modelo
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        console.warn(`Model ${model} returned empty content`);
        continue;
      }

      const parsed = parseJson(content);

      console.log(`✅ Groq success with model: ${model}`);

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
      console.warn(`Model ${model} threw error:`, error.message);
      
      // Propagar errores de auth/rate limit
      if (error.message?.startsWith('GROQ_')) {
        throw error;
      }
      
      // Otros errores, probar siguiente modelo
      continue;
    }
  }

  // Si ningún modelo funcionó
  return {
    success: false,
    reply: '',
    actions: [],
    error: 'Ningún modelo de Groq disponible funcionó. Verifica tu API key en console.groq.com',
  };
}