import { AiProvider, ChatAction, ChatHistoryMessage, EventType, ScheduleEvent } from '@/types/schedule';
import {
  DAYS_OF_WEEK,
  isSameActivity,
  minutesToTime,
  normalizeTime,
  parseDay,
  sanitizeEvent,
  timeToMinutes,
} from '@/lib/schedule-utils';
import { getZonedNow, safeTimezone } from '@/lib/timezone';
import { AiError, friendlyAiMessage, PROVIDER_NAMES } from './errors';
import { AiJsonResult, geminiGenerateJson } from './gemini';
import { groqGenerateJson } from './groq';

export interface AiKeys {
  gemini?: string;
  groq?: string;
}

function pickKey(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length >= 20 ? value.trim() : undefined;
}

/** Claves del usuario (Ajustes) con respaldo en las variables de entorno del servidor */
export function resolveKeys(body: any): AiKeys {
  return {
    gemini: pickKey(body?.geminiKey) || pickKey(body?.apiKey) || pickKey(process.env.GEMINI_API_KEY) || pickKey(process.env.GOOGLE_API_KEY),
    groq: pickKey(body?.groqKey) || pickKey(process.env.GROQ_API_KEY),
  };
}

export function serverKeyStatus(): Record<AiProvider, boolean> {
  return {
    gemini: Boolean(pickKey(process.env.GEMINI_API_KEY) || pickKey(process.env.GOOGLE_API_KEY)),
    groq: Boolean(pickKey(process.env.GROQ_API_KEY)),
  };
}

export const NO_KEYS_MESSAGE =
  'Falta configurar la IA: abre ⚙️ Ajustes y pega una clave gratuita de Google Gemini o de Groq (toma 1 minuto y no pide tarjeta).';

interface ProviderAttempt {
  provider: AiProvider;
  run: () => Promise<AiJsonResult>;
}

interface ProviderResult extends AiJsonResult {
  provider: AiProvider;
  warnings: string[];
}

/** Ejecuta los proveedores en orden; si uno falla (cuota, clave, caída) se usa el siguiente. */
async function runWithFallback(attempts: ProviderAttempt[]): Promise<ProviderResult> {
  if (attempts.length === 0) {
    throw new AiError('NO_KEY', 'gemini', NO_KEYS_MESSAGE);
  }

  const errors: AiError[] = [];
  for (const attempt of attempts) {
    try {
      const result = await attempt.run();
      const warnings = errors.map((e) => `${PROVIDER_NAMES[e.provider]} no respondió (${e.message}) y se usó ${PROVIDER_NAMES[attempt.provider]}.`);
      return { ...result, provider: attempt.provider, warnings };
    } catch (err) {
      const aiError = err instanceof AiError ? err : new AiError('NETWORK', attempt.provider, friendlyAiMessage('NETWORK', attempt.provider), String(err));
      console.warn(`[ia] ${attempt.provider} falló:`, aiError.code, aiError.detail || aiError.message);
      errors.push(aiError);
    }
  }

  // Todos fallaron: devolver un mensaje que combine los motivos (y el detalle técnico de cada uno)
  const message = errors.map((e) => e.message).join(' ');
  const detail = errors.map((e) => `[${e.provider}] ${e.detail || e.code}`).join(' || ');
  throw new AiError(errors[errors.length - 1].code, errors[errors.length - 1].provider, message, detail);
}

const DAY_KEYS = DAYS_OF_WEEK.map((d) => d.key);

// ---------------------------------------------------------------------------
// Lectura de horarios desde una foto
// ---------------------------------------------------------------------------

const IMAGE_SCHEMA_GEMINI = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Nombre de la materia, curso o turno' },
          dayOfWeek: { type: 'STRING', enum: DAY_KEYS },
          startTime: { type: 'STRING', description: 'HH:mm en 24 horas' },
          endTime: { type: 'STRING', description: 'HH:mm en 24 horas' },
          location: { type: 'STRING', nullable: true },
          teacher: { type: 'STRING', nullable: true },
          notes: { type: 'STRING', nullable: true },
        },
        required: ['title', 'dayOfWeek', 'startTime', 'endTime'],
      },
    },
    warning: { type: 'STRING', nullable: true },
  },
  required: ['items'],
};

const nullableString = { type: ['string', 'null'] };

const IMAGE_SCHEMA_STRICT = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'warning'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'dayOfWeek', 'startTime', 'endTime', 'location', 'teacher', 'notes'],
        properties: {
          title: { type: 'string' },
          dayOfWeek: { type: 'string', enum: DAY_KEYS },
          startTime: { type: 'string' },
          endTime: { type: 'string' },
          location: nullableString,
          teacher: nullableString,
          notes: nullableString,
        },
      },
    },
    warning: nullableString,
  },
};

function imageSystemPrompt(scheduleType: EventType): string {
  const kind = scheduleType === 'work' ? 'TRABAJO / TURNOS LABORALES' : 'UNIVERSIDAD / CLASES';
  return `Eres un experto en leer horarios (OCR) de universidades y de trabajos. Examina la imagen con cuidado: puede ser una tabla, una captura de pantalla del portal estudiantil, una foto de una hoja impresa o escrita a mano.

El horario es principalmente de: ${kind}.

Procedimiento (síguelo en orden, sin saltarte nada):
A. Identifica las columnas de días (lunes a domingo) y el rango de horas de la cuadrícula.
B. Recorre CADA columna de arriba hacia abajo y anota TODOS los bloques asignados que veas en ella; un día puede tener varios bloques seguidos.
C. Antes de responder, revisa columna por columna que no falte ningún bloque asignado.

Reglas:
1. Extrae CADA bloque con una actividad asignada (materia, clase, grupo, turno), en todos los días. Si una materia o turno ocurre varios días, crea un elemento por cada día.
2. MUY IMPORTANTE: los bloques de DISPONIBILIDAD NO son actividades. Ignora por completo los bloques cuyo texto sea "Disponible", "Disponibilidad", "Available", "Libre", "Free", "Abierto", "Sin asignar" o similar, aunque ocupen casi todo el día. En plataformas de trabajo suelen ser bloques de un color (por ejemplo verdes) y las clases o turnos asignados son de otro color (por ejemplo azules): extrae SOLO los asignados.
3. Si el bloque trae su hora escrita (por ejemplo "20:00-21:30"), usa EXACTAMENTE esa hora. Solo estima por la posición en la cuadrícula cuando el bloque no tiene hora escrita.
4. En tablas donde las filas son horas y las columnas días, un bloque que ocupa varias filas seguidas es UNA sola actividad desde la primera hora hasta el final de la última. Si las columnas muestran fechas (02.11.2026), usa solo el día de la semana del encabezado.
5. Días válidos (minúsculas y sin tilde): lunes, martes, miercoles, jueves, viernes, sabado, domingo. Las abreviaturas L, M, X/Mi, J, V, S, D significan lunes a domingo.
6. Horas SIEMPRE en 24h "HH:mm": "8am" → "08:00", "2pm" → "14:00", "7:00 a 8:30" → inicio "07:00" y fin "08:30". Turnos escritos como "6-2" significan 06:00 a 14:00.
7. Si no aparece la hora de fin, estima la duración típica del bloque (normalmente 1 o 2 horas).
8. Ignora recesos, almuerzos y días marcados como "libre" o "descanso"; no son actividades.
9. "title" = nombre de la materia, clase o turno SIN la hora. Si el bloque tiene un código principal (por ejemplo "M4L14") y debajo un código de grupo (por ejemplo "COL13241_LU-20"), usa el principal como "title" y el de grupo en "notes".
10. "location" = aula, salón, edificio, sede o sucursal; "teacher" = docente o supervisor; "notes" = grupo, NRC, código, modalidad u otro dato útil. Usa null si no aparece.
11. Escribe los nombres de materias completos y limpios (corrige mayúsculas raras, conserva tildes). Respeta los códigos tal cual (M4L14, PRM_COL14394_MA-18…).
12. Si la imagen no es un horario o es ilegible, devuelve "items": [] y explica el problema en "warning" en español.

Devuelve únicamente JSON: {"items": [{"title": "...", "dayOfWeek": "lunes", "startTime": "07:00", "endTime": "09:00", "location": null, "teacher": null, "notes": null}], "warning": null}`;
}

/**
 * Bloques de disponibilidad ("Disponible", "Available", "Libre"…) que aparecen en las plataformas de
 * turnos: indican cuándo PUEDES trabajar, no cuándo trabajas. Se descartan aunque la IA los devuelva.
 */
export function isAvailabilityBlock(title: string): boolean {
  const clean = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\d{1,2}\s*[:.h]\s*\d{2}/g, ' ') // horas escritas dentro del título
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(no )?(disponible|disponibles|disponibilidad|available|availability|libre|libres|free|open|abierto|sin asignar|unassigned|horario libre|tiempo libre)$/.test(clean);
}

export interface ImageExtractionResult {
  events: ScheduleEvent[];
  provider: AiProvider;
  model: string;
  warnings: string[];
}

export async function extractScheduleFromImage(params: {
  imageBase64: string;
  mimeType: string;
  scheduleType: EventType;
  keys: AiKeys;
}): Promise<ImageExtractionResult> {
  const { imageBase64, mimeType, scheduleType, keys } = params;
  const deadline = Date.now() + 55_000;
  const system = imageSystemPrompt(scheduleType);
  const instruction = `Extrae TODOS los bloques de ${scheduleType === 'work' ? 'turnos o clases asignadas de trabajo' : 'clases'} de esta imagen, revisando cada día de la semana, y devuelve el JSON.`;

  const attempts: ProviderAttempt[] = [];
  if (keys.gemini) {
    attempts.push({
      provider: 'gemini',
      run: () => geminiGenerateJson({
        apiKey: keys.gemini!,
        systemPrompt: system,
        // Imagen primero y luego la instrucción, como recomienda Google
        parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: instruction }],
        responseSchema: IMAGE_SCHEMA_GEMINI,
        highResolutionImages: true,
        // Límite por modelo: si uno está lento o saturado se pasa al siguiente sin agotar el plazo
        perCallTimeoutMs: 30_000,
        // Si Groq también está configurado, dejar tiempo para usarlo como respaldo
        deadline: keys.groq ? deadline - 20_000 : deadline,
        // Incluye los Flash-Lite, que suelen estar libres cuando los Flash están saturados (los 503 responden en ~2 s)
        maxModels: 9,
      }),
    });
  }
  if (keys.groq) {
    attempts.push({
      provider: 'groq',
      run: () => groqGenerateJson({
        apiKey: keys.groq!,
        vision: true,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              { type: 'text', text: instruction },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        jsonSchema: { name: 'horario', schema: IMAGE_SCHEMA_STRICT },
        deadline,
      }),
    });
  }

  const result = await runWithFallback(attempts);
  const rawItems: unknown[] = Array.isArray(result.data?.items) ? result.data.items : Array.isArray(result.data) ? result.data : [];

  const events: ScheduleEvent[] = [];
  let ignoredAvailability = 0;
  for (const item of rawItems) {
    const ev = sanitizeEvent({ ...(item as object), id: undefined, type: scheduleType }, scheduleType);
    if (!ev) continue;
    if (isAvailabilityBlock(ev.title)) {
      ignoredAvailability++;
      continue;
    }
    if (!events.some((existing) => isSameActivity(existing, ev))) events.push(ev);
  }

  const warnings = [...result.warnings];
  if (ignoredAvailability > 0) {
    warnings.push(`Se ignoraron ${ignoredAvailability} bloques de "Disponible": marcan tu disponibilidad, no son clases ni turnos.`);
  }
  if (typeof result.data?.warning === 'string' && result.data.warning.trim() && events.length === 0) {
    warnings.push(result.data.warning.trim());
  }

  return { events, provider: result.provider, model: result.model, warnings };
}

// ---------------------------------------------------------------------------
// Asistente de agenda (chat)
// ---------------------------------------------------------------------------

const CHAT_EVENT_FIELDS = ['title', 'type', 'dayOfWeek', 'startTime', 'endTime', 'location', 'teacher', 'notes'] as const;

const CHAT_SCHEMA_GEMINI = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    actions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['add', 'update', 'delete'] },
          eventId: { type: 'STRING', nullable: true },
          event: {
            type: 'OBJECT',
            nullable: true,
            properties: Object.fromEntries(CHAT_EVENT_FIELDS.map((f) => [f, { type: 'STRING', nullable: true }])),
          },
        },
        required: ['type'],
      },
    },
  },
  required: ['reply', 'actions'],
};

const CHAT_SCHEMA_STRICT = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'actions'],
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'eventId', 'event'],
        properties: {
          type: { type: 'string', enum: ['add', 'update', 'delete'] },
          eventId: nullableString,
          event: {
            type: 'object',
            additionalProperties: false,
            required: [...CHAT_EVENT_FIELDS],
            properties: Object.fromEntries(CHAT_EVENT_FIELDS.map((f) => [f, nullableString])),
          },
        },
      },
    },
  },
};

const TYPE_NAMES: Record<EventType, string> = { university: 'university', work: 'work', personal: 'personal' };

function chatSystemPrompt(events: ScheduleEvent[], refs: Map<string, string>, timezone: string, now: Date): string {
  const zoned = getZonedNow(timezone, now);
  const today = DAYS_OF_WEEK[zoned.dayIndex];
  const tomorrow = DAYS_OF_WEEK[(zoned.dayIndex + 1) % 7];
  const time = minutesToTime(zoned.minutes);

  const lines = events.length === 0
    ? '(el horario está vacío)'
    : events
        .slice()
        .sort((a, b) => DAY_KEYS.indexOf(a.dayOfWeek) - DAY_KEYS.indexOf(b.dayOfWeek) || timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
        .map((e) => [refs.get(e.id), e.title, TYPE_NAMES[e.type], e.dayOfWeek, `${e.startTime}-${e.endTime}`, e.location || '-', e.teacher || '-', e.notes || '-'].join(' | '))
        .join('\n');

  return `Eres el asistente de agenda de "MiHorario IA". Hablas en español, eres breve, claro y amable.
Ahora para el usuario es ${today.label} ${zoned.dateISO}, ${time} (zona ${timezone}). "Hoy" = ${today.key}, "mañana" = ${tomorrow.key}.
El horario es SEMANAL y se repite cada semana: cada actividad tiene un día de la semana, no una fecha.

Horario actual (ref | título | tipo | día | inicio-fin | lugar | docente | notas):
${lines}

Puedes hacer:
- "add": crear actividades. Si menciona varios días ("lunes y miércoles"), crea una acción por día.
- "update": modificar una actividad existente. "eventId" = su ref (e1, e2…). En "event" pon SOLO los campos que cambian y deja el resto en null.
- "delete": eliminar. "eventId" = su ref. Para "borra todas mis clases del lunes" crea una acción por cada ref.
- Responder preguntas sobre el horario (qué hay mañana, horas libres, choques) sin acciones.

Reglas:
- Días válidos (sin tilde): lunes, martes, miercoles, jueves, viernes, sabado, domingo.
- Horas en 24h "HH:mm": "2 pm" → "14:00", "siete y media de la noche" → "19:30", "mediodía" → "12:00".
- Si al crear falta la hora de fin, usa 1 hora de duración y dilo en la respuesta.
- "type": university (clases, materias, universidad), work (trabajo, turnos), personal (gimnasio, citas, cursos particulares, otros).
- Usa solo refs que existan en la lista. Si hay ambigüedad real (dos actividades encajan y no sabes cuál) NO hagas acciones y pregunta.
- Si la nueva actividad choca con otra existente, hazla igual pero avisa del choque en la respuesta.
- "reply" confirma en lenguaje natural lo que hiciste, por ejemplo: "Listo, agendé Inglés el sábado de 14:00 a 15:00."

Responde SOLO con JSON con esta forma exacta:
{"reply": "texto para el usuario", "actions": [{"type": "add" | "update" | "delete", "eventId": "e1" o null, "event": {"title": null, "type": null, "dayOfWeek": null, "startTime": null, "endTime": null, "location": null, "teacher": null, "notes": null}}]}
Si no hay cambios que hacer, usa "actions": [].`;
}

/** Convierte el "event" parcial de la IA en un parche validado (solo campos presentes y correctos) */
function cleanPatch(raw: any): Partial<Omit<ScheduleEvent, 'id'>> {
  if (!raw || typeof raw !== 'object') return {};
  const patch: Partial<Omit<ScheduleEvent, 'id'>> = {};
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim().slice(0, max) : undefined);

  const title = text(raw.title, 120);
  if (title) patch.title = title;
  if (raw.type === 'university' || raw.type === 'work' || raw.type === 'personal') patch.type = raw.type;
  const day = parseDay(raw.dayOfWeek);
  if (day) patch.dayOfWeek = day;
  const start = normalizeTime(raw.startTime);
  if (start) patch.startTime = start;
  const end = normalizeTime(raw.endTime);
  if (end) patch.endTime = end;
  const location = text(raw.location, 120);
  if (location) patch.location = location;
  const teacher = text(raw.teacher, 120);
  if (teacher) patch.teacher = teacher;
  const notes = text(raw.notes, 500);
  if (notes) patch.notes = notes;
  return patch;
}

export interface ChatResult {
  reply: string;
  actions: ChatAction[];
  provider: AiProvider;
  model: string;
  warnings: string[];
}

export async function runScheduleChat(params: {
  message: string;
  history: ChatHistoryMessage[];
  events: ScheduleEvent[];
  timezone?: string;
  keys: AiKeys;
  now?: Date;
}): Promise<ChatResult> {
  const { message, history, events, keys } = params;
  const timezone = safeTimezone(params.timezone);
  const now = params.now || new Date();
  const deadline = Date.now() + 50_000;

  // Referencias cortas (e1, e2…) en lugar de UUIDs: menos tokens y la IA no las inventa
  const refs = new Map<string, string>();
  const byRef = new Map<string, ScheduleEvent>();
  events.forEach((ev, index) => {
    const ref = `e${index + 1}`;
    refs.set(ev.id, ref);
    byRef.set(ref, ev);
  });

  const system = chatSystemPrompt(events, refs, timezone, now);
  const recentHistory = history.slice(-8).map((m) => ({ role: m.role, content: m.text.slice(0, 1000) }));

  const attempts: ProviderAttempt[] = [];
  if (keys.groq) {
    attempts.push({
      provider: 'groq',
      run: () => groqGenerateJson({
        apiKey: keys.groq!,
        messages: [{ role: 'system', content: system }, ...recentHistory, { role: 'user', content: message }],
        jsonSchema: { name: 'acciones_agenda', schema: CHAT_SCHEMA_STRICT },
        temperature: 0.2,
        deadline: keys.gemini ? deadline - 18_000 : deadline,
      }),
    });
  }
  if (keys.gemini) {
    const conversation = recentHistory.map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`).join('\n');
    attempts.push({
      provider: 'gemini',
      run: () => geminiGenerateJson({
        apiKey: keys.gemini!,
        systemPrompt: system,
        parts: [{ text: `${conversation ? `Conversación previa:\n${conversation}\n\n` : ''}Pedido del usuario: ${message}` }],
        responseSchema: CHAT_SCHEMA_GEMINI,
        temperature: 0.2,
        fastThinking: true,
        perCallTimeoutMs: 15_000,
        deadline,
        maxModels: 4,
      }),
    });
  }

  const result = await runWithFallback(attempts);
  const rawActions: any[] = Array.isArray(result.data?.actions) ? result.data.actions : [];
  let reply = typeof result.data?.reply === 'string' && result.data.reply.trim() ? result.data.reply.trim() : 'Listo.';

  const resolveId = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    if (byRef.has(value)) return byRef.get(value)!.id;
    // Por si el modelo devuelve el ID real en vez de la ref
    return events.some((e) => e.id === value) ? value : null;
  };

  const actions: ChatAction[] = [];
  const touched = new Set<string>();
  for (const raw of rawActions) {
    if (raw?.type === 'add') {
      const ev = sanitizeEvent({ ...raw.event, id: undefined }, 'personal');
      if (!ev) continue;
      const { id: _ignored, ...event } = ev;
      actions.push({ type: 'add', event });
    } else if (raw?.type === 'update') {
      const id = resolveId(raw.eventId);
      if (!id || touched.has(`delete:${id}`)) continue;
      const original = events.find((e) => e.id === id)!;
      const patch = cleanPatch(raw.event);
      if (Object.keys(patch).length === 0) continue;

      // Si solo cambia la hora de inicio, conservar la duración original
      if (patch.startTime && !patch.endTime) {
        const duration = timeToMinutes(original.endTime) - timeToMinutes(original.startTime);
        patch.endTime = minutesToTime(timeToMinutes(patch.startTime) + Math.max(15, duration));
      }
      const start = patch.startTime || original.startTime;
      const end = patch.endTime || original.endTime;
      if (timeToMinutes(end) <= timeToMinutes(start)) patch.endTime = minutesToTime(timeToMinutes(start) + 60);

      actions.push({ type: 'update', eventId: id, event: patch });
      touched.add(`update:${id}`);
    } else if (raw?.type === 'delete') {
      const id = resolveId(raw.eventId);
      if (!id || touched.has(`delete:${id}`)) continue;
      actions.push({ type: 'delete', eventId: id });
      touched.add(`delete:${id}`);
    }
  }

  if (rawActions.length > 0 && actions.length === 0) {
    reply = 'No pude identificar con seguridad qué actividad cambiar. ¿Me dices el nombre exacto y el día?';
  }

  return { reply, actions, provider: result.provider, model: result.model, warnings: result.warnings };
}

// ---------------------------------------------------------------------------
// Diagnóstico de claves (botón "Probar conexión" en Ajustes)
// ---------------------------------------------------------------------------

export interface ProviderTestResult {
  ok: boolean;
  model?: string;
  source: 'user' | 'server' | 'none';
  error?: string;
}

export async function testProvider(provider: AiProvider, apiKey: string | undefined, source: ProviderTestResult['source']): Promise<ProviderTestResult> {
  if (!apiKey) return { ok: false, source: 'none', error: friendlyAiMessage('NO_KEY', provider) };
  const deadline = Date.now() + 25_000;
  try {
    const result = provider === 'gemini'
      ? await geminiGenerateJson({
          apiKey,
          systemPrompt: 'Responde solo con JSON.',
          parts: [{ text: 'Devuelve {"ok": true}' }],
          fastThinking: true,
          deadline,
          maxModels: 4,
        })
      : await groqGenerateJson({
          apiKey,
          messages: [
            { role: 'system', content: 'Responde solo con JSON.' },
            { role: 'user', content: 'Devuelve {"ok": true}' },
          ],
          deadline,
        });
    return { ok: true, model: result.model, source };
  } catch (err) {
    return { ok: false, source, error: err instanceof AiError ? err.message : 'Error desconocido' };
  }
}
