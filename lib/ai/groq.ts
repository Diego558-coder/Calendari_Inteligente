import { createHash } from 'node:crypto';
import { AiError, extractJson, failuresToError, fetchWithTimeout, friendlyAiMessage, isAbortError, ModelFailure } from './errors';
import type { AiJsonResult } from './gemini';

const GROQ_API = 'https://api.groq.com/openai/v1';

/**
 * Modelos de texto gratuitos de Groq en orden de preferencia (octubre 2026).
 * Los Llama 3.x se apagaron el 16/08/2026; su reemplazo oficial es gpt-oss.
 */
const CHAT_PREFERENCE = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
  'meta-models/muse-spark-open',
];

/** Modelos con visión (lectura de imágenes) disponibles en Groq */
const VISION_PREFERENCE = [
  'qwen/qwen3.8-27b',
  'meta-models/muse-spark-open',
];

// Modelos que no son de chat (voz, moderación, agentes compuestos)
const EXCLUDED = /(whisper|tts|orpheus|guard|safeguard|compound|playai|distil)/i;

const MODEL_CACHE_TTL = 30 * 60 * 1000;
const modelCache = new Map<string, { models: string[]; at: number }>();

function keyFingerprint(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
}

/**
 * Lista los modelos activos de la cuenta. Lanza AiError('INVALID_KEY') si Groq rechaza la clave.
 * Si la lista no está disponible devuelve null y se usan las preferencias fijas.
 */
export async function listGroqModels(apiKey: string): Promise<string[] | null> {
  const fp = keyFingerprint(apiKey);
  const cached = modelCache.get(fp);
  if (cached && Date.now() - cached.at < MODEL_CACHE_TTL) return cached.models;

  let res: Response;
  try {
    res = await fetchWithTimeout(`${GROQ_API}/models`, { headers: { Authorization: `Bearer ${apiKey}` } }, 8000);
  } catch {
    return null;
  }

  if (res.status === 401 || res.status === 403) {
    const body = await res.text().catch(() => '');
    throw new AiError('INVALID_KEY', 'groq', friendlyAiMessage('INVALID_KEY', 'groq'), body.slice(0, 300));
  }
  if (!res.ok) return null;

  const data = await res.json().catch(() => ({}));
  const models: string[] = (data.data || [])
    .filter((m: any) => m.active !== false && typeof m.id === 'string' && !EXCLUDED.test(m.id))
    .map((m: any) => m.id);

  modelCache.set(fp, { models, at: Date.now() });
  return models;
}

/** Elige los modelos a probar: preferidos que existan en la cuenta + otros nuevos compatibles */
export async function pickGroqModels(apiKey: string, vision: boolean): Promise<string[]> {
  const preference = vision ? VISION_PREFERENCE : CHAT_PREFERENCE;
  const available = await listGroqModels(apiKey);
  if (!available) return preference;

  const preferred = preference.filter((id) => available.includes(id));
  // Modelos nuevos que Groq agregue después de escribir esta lista
  const extra = available.filter((id) => !preference.includes(id) && (vision ? /vision|vl|scout|maverick|qwen3\.\d|muse/i.test(id) : !/vision/i.test(id)));
  const result = [...preferred, ...extra];
  return result.length > 0 ? result : preference;
}

export interface GroqJsonRequest {
  apiKey: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: any }>;
  /** JSON Schema estricto (todas las propiedades requeridas, opcionales como null) */
  jsonSchema?: { name: string; schema: object };
  vision?: boolean;
  temperature?: number;
  deadline: number;
  maxModels?: number;
}

/**
 * Llama a Groq (API compatible con OpenAI) probando modelos hasta obtener JSON válido.
 */
export async function groqGenerateJson(req: GroqJsonRequest): Promise<AiJsonResult> {
  const models = (await pickGroqModels(req.apiKey, Boolean(req.vision))).slice(0, req.maxModels ?? 4);
  const failures: ModelFailure[] = [];

  for (const model of models) {
    // 1º salida estructurada con esquema; 2º modo JSON simple si el modelo no acepta el esquema
    for (const full of [true, false]) {
      const remaining = req.deadline - Date.now();
      if (remaining < 3000) break;

      const body: Record<string, unknown> = {
        model,
        messages: req.messages,
        temperature: req.temperature ?? 0.1,
        max_completion_tokens: 4096,
        response_format:
          full && req.jsonSchema
            ? { type: 'json_schema', json_schema: { name: req.jsonSchema.name, strict: true, schema: req.jsonSchema.schema } }
            : { type: 'json_object' },
      };
      // gpt-oss razona antes de responder; "low" lo hace mucho más rápido sin perder calidad para esta tarea
      if (full && model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';

      let res: Response;
      try {
        res = await fetchWithTimeout(
          `${GROQ_API}/chat/completions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.apiKey}` },
            body: JSON.stringify(body),
          },
          Math.min(remaining, 40000)
        );
      } catch (err) {
        failures.push({ model, code: isAbortError(err) ? 'TIMEOUT' : 'NETWORK', detail: String(err) });
        break;
      }

      if (res.ok) {
        const payload = await res.json().catch(() => null);
        const content: string = payload?.choices?.[0]?.message?.content || '';
        if (!content) {
          failures.push({ model, code: 'BAD_RESPONSE', detail: 'Respuesta vacía' });
          break;
        }
        try {
          return { data: extractJson(content), model };
        } catch {
          failures.push({ model, code: 'BAD_RESPONSE', detail: content.slice(0, 200) });
          break;
        }
      }

      const text = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        throw new AiError('INVALID_KEY', 'groq', friendlyAiMessage('INVALID_KEY', 'groq'), text.slice(0, 300));
      }
      if (res.status === 400 && full && !/decommissioned|does not exist|model_not_found/i.test(text)) {
        continue; // reintentar el mismo modelo en modo JSON simple
      }
      failures.push({ model, code: res.status === 429 ? 'QUOTA' : 'NO_MODEL', detail: `${res.status}: ${text.slice(0, 200)}` });
      break;
    }
  }

  throw failuresToError('groq', failures);
}
