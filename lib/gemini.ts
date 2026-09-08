import { DayOfWeek, EventType, ScheduleEvent } from '@/types/schedule';
import { normalizeDay } from './schedule-utils';

export interface ExtractedEventRaw {
  title: string;
  type?: EventType;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location?: string;
  teacher?: string;
  notes?: string;
}

export interface AnalyzeScheduleResult {
  success: boolean;
  events: ScheduleEvent[];
  rawText?: string;
  error?: string;
}

/**
 * Obtiene la lista de modelos disponibles para la clave de API del usuario
 */
async function getAvailableModels(apiKey: string): Promise<string[]> {
  const fallbackModels = [
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-2.5-flash',
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash-001',
    'gemini-1.5-flash-002',
    'gemini-2.5-flash-lite',
    'gemini-1.5-pro',
  ];

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn('No se pudo listar modelos desde Google AI Studio:', errText);
      return fallbackModels;
    }

    const data = await res.json();
    const modelsList: any[] = data.models || [];

    // Filtrar los que admiten generateContent
    const validModels = modelsList
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''));

    if (validModels.length === 0) return fallbackModels;

    // Priorizar modelos Flash rápidos y multimodales
    const flashModels = validModels.filter((name) => name.toLowerCase().includes('flash'));
    const otherModels = validModels.filter((name) => !name.toLowerCase().includes('flash'));

    return [...flashModels, ...otherModels];
  } catch (err) {
    console.warn('Error conectando con endpoint de modelos, usando lista predeterminada:', err);
    return fallbackModels;
  }
}

/**
 * Llama a la API de Google Gemini para analizar la foto del horario
 */
export async function analyzeScheduleImageWithGemini(
  base64Data: string,
  mimeType: string,
  scheduleType: EventType,
  apiKey?: string
): Promise<AnalyzeScheduleResult> {
  const rawKey = apiKey || process.env.GEMINI_API_KEY;

  if (!rawKey || !rawKey.trim()) {
    return {
      success: false,
      events: [],
      error: 'No se encontró la clave de API de Gemini. Configúrala en Ajustes (arriba a la derecha) o en las variables de entorno de Vercel (GEMINI_API_KEY).',
    };
  }

  const cleanKey = rawKey.trim();

  // Schema estructurado para forzar respuesta JSON precisa
  const scheduleSchema = {
    type: 'OBJECT',
    properties: {
      items: {
        type: 'ARRAY',
        description: 'Lista de clases o turnos detectados en la imagen',
        items: {
          type: 'OBJECT',
          properties: {
            title: {
              type: 'STRING',
              description: 'Nombre de la materia, curso o turno de trabajo (ej: Cálculo I, Guardia, Programación)',
            },
            dayOfWeek: {
              type: 'STRING',
              description: 'Día de la semana: lunes, martes, miercoles, jueves, viernes, sabado, domingo',
            },
            startTime: {
              type: 'STRING',
              description: 'Hora de inicio en formato 24 horas HH:mm (ej: 07:00, 14:30)',
            },
            endTime: {
              type: 'STRING',
              description: 'Hora de finalización en formato 24 horas HH:mm (ej: 09:00, 16:00)',
            },
            location: {
              type: 'STRING',
              description: 'Aula, laboratorio, edificio, sede o sucursal si aparece',
            },
            teacher: {
              type: 'STRING',
              description: 'Nombre del docente, profesor o supervisor si aparece',
            },
            notes: {
              type: 'STRING',
              description: 'Información adicional como grupo, créditos o modalidad',
            },
          },
          required: ['title', 'dayOfWeek', 'startTime', 'endTime'],
        },
      },
    },
    required: ['items'],
  };

  const systemPrompt = `Eres un asistente experto en OCR y extracción de horarios de estudio universitario y horarios laborales.
Tu objetivo es examinar minuciosamente la imagen proporcionada (que puede ser una tabla, captura de pantalla, foto de celular de una hoja impresa o manuscrita) y extraer cada bloque de horario con exactitud.

Instrucciones estrictas:
1. El tipo de horario analizado es principalmente: ${scheduleType === 'university' ? 'UNIVERSIDAD / CLASES' : 'TRABAJO / TURNOS LABORALES'}.
2. Identifica con exactitud los días de la semana: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo.
3. Si una materia o turno se repite varios días (por ejemplo "Lunes y Miércoles de 08:00 a 10:00"), crea un elemento separado para cada día.
4. Normaliza SIEMPRE las horas al formato 24h "HH:mm" (por ejemplo: "8am" -> "08:00", "2pm" -> "14:00", "7:00 a 8:30" -> startTime: "07:00", endTime: "08:30").
5. Si no se indica la hora de fin con exactitud pero dura un bloque estándar (ej. 1 hora o 2 horas), calcula la hora de fin sumando la duración habitual.
6. Extrae los nombres de materias limpios, sin abreviaturas raras si se pueden entender, junto al aula y docente si están presentes.
7. Devuelve ÚNICAMENTE un objeto JSON válido con la propiedad "items": [{"title": "...", "dayOfWeek": "lunes|martes|...", "startTime": "HH:mm", "endTime": "HH:mm", "location": "...", "teacher": "..."}].`;

  // 1. Descubrir los modelos reales soportados por la clave
  const modelsToTry = await getAvailableModels(cleanKey);
  console.log('Modelos disponibles para intentar:', modelsToTry.slice(0, 4));

  const errorsLogged: string[] = [];

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;

      // Intentar primero con responseSchema si está disponible
      const requestBody: any = {
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            parts: [
              {
                text: `Por favor extrae todos los bloques de ${scheduleType === 'university' ? 'clases universitarias' : 'turnos de trabajo'} de esta imagen. Devuelve el JSON con la propiedad "items".`,
              },
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: scheduleSchema,
        },
      };

      let response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': cleanKey,
        },
        body: JSON.stringify(requestBody),
      });

      // Si falla por esquema no soportado en algún modelo particular, reintentar sin responseSchema
      if (!response.ok && response.status === 400) {
        delete requestBody.generationConfig.responseSchema;
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': cleanKey,
          },
          body: JSON.stringify(requestBody),
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Intento con ${model} falló (${response.status}):`, errText);
        errorsLogged.push(`${model} (${response.status}): ${errText.slice(0, 120)}`);
        continue; // Intentar con el siguiente modelo disponible
      }

      const data = await response.json();
      const rawResponseText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawResponseText) {
        throw new Error(`El modelo ${model} no retornó texto legible.`);
      }

      let parsedJson: { items?: ExtractedEventRaw[] } = {};
      try {
        parsedJson = JSON.parse(rawResponseText);
      } catch {
        // En caso de que venga envuelto en markdown ```json ... ```
        const jsonMatch = rawResponseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          parsedJson = JSON.parse(jsonMatch[1]);
        } else {
          // Intentar encontrar el primer '{' y el último '}'
          const start = rawResponseText.indexOf('{');
          const end = rawResponseText.lastIndexOf('}');
          if (start !== -1 && end !== -1) {
            parsedJson = JSON.parse(rawResponseText.substring(start, end + 1));
          } else {
            throw new Error('No se pudo parsear el formato JSON generado por el modelo.');
          }
        }
      }

      const rawItems = parsedJson.items || (Array.isArray(parsedJson) ? parsedJson : []);

      // Convertir a ScheduleEvent estructurado
      const formattedEvents: ScheduleEvent[] = rawItems.map((item: any, index: number) => {
        const cleanStart = formatTime(item.startTime);
        const cleanEnd = formatTime(item.endTime);

        return {
          id: `ai-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
          title: item.title?.trim() || 'Actividad sin nombre',
          type: scheduleType,
          dayOfWeek: normalizeDay(item.dayOfWeek),
          startTime: cleanStart,
          endTime: cleanEnd,
          location: item.location?.trim() || undefined,
          teacher: item.teacher?.trim() || undefined,
          notes: item.notes?.trim() || undefined,
        };
      });

      return {
        success: true,
        events: formattedEvents,
        rawText: rawResponseText,
      };
    } catch (err: any) {
      console.error(`Error procesando con ${model}:`, err);
      errorsLogged.push(`${model}: ${err.message || 'Error desconocido'}`);
    }
  }

  return {
    success: false,
    events: [],
    error: `No se pudo procesar la imagen con los modelos disponibles de Gemini. Detalles: ${errorsLogged.slice(0, 2).join(' | ')}`,
  };
}

/**
 * Asegura formato HH:mm válido
 */
function formatTime(t: string): string {
  if (!t) return '08:00';
  const clean = t.trim();
  const match = clean.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const h = match[1].padStart(2, '0');
    const m = match[2];
    return `${h}:${m}`;
  }
  const justHour = clean.match(/^(\d{1,2})$/);
  if (justHour) {
    return `${justHour[1].padStart(2, '0')}:00`;
  }
  return '08:00';
}
