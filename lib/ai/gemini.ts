import { createHash } from 'node:crypto';
import { AiError, extractJson, failuresToError, fetchWithTimeout, friendlyAiMessage, isAbortError, ModelFailure } from './errors';

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Modelos gratuitos de Google AI Studio en orden de preferencia. Solo se usan si no se puede
 * consultar la lista real de modelos de la cuenta (que es lo normal: se descubren solos y así
 * la app sigue funcionando cuando Google lanza o retira modelos).
 */
const FALLBACK_MODELS = [
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3-flash-preview',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

// Variantes que no sirven para leer imágenes y devolver JSON (voz, tiempo real, generación de imágenes…)
const EXCLUDED = /(tts|live|image|audio|embed|robotics|computer-use|translate|aqa|imagen|veo|lyria|native|learnlm|gemma|nano|research|thinking-exp)/i;

const MODEL_CACHE_TTL = 30 * 60 * 1000;
const modelCache = new Map<string, { models: string[]; at: number }>();

function keyFingerprint(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
}

function parseVersion(name: string): number {
  const match = name.match(/gemini-(\d+)(?:\.(\d+))?/);
  if (!match) return 0;
  return parseInt(match[1], 10) + (match[2] ? parseInt(match[2], 10) / 10 : 0);
}

/** Ordena: alias "latest" → Flash más nuevo estable → previews → Flash-Lite */
export function rankGeminiModels(names: string[]): string[] {
  const candidates = names.filter((name) => name.includes('flash') && !EXCLUDED.test(name));
  return candidates.sort((a, b) => {
    const score = (n: string) => [
      n === 'gemini-flash-latest' ? 0 : 1,
      n.includes('lite') ? 1 : 0,
      -parseVersion(n),
      /preview|exp/.test(n) ? 1 : 0,
      n.length,
    ];
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return sa[i] - sb[i];
    }
    return a.localeCompare(b);
  });
}

function isInvalidKeyResponse(status: number, body: string): boolean {
  if (status === 401) return true;
  if (/API_KEY_INVALID|API key not valid|API_KEY_SERVICE_BLOCKED|SERVICE_DISABLED|API key expired/i.test(body)) return true;
  return false;
}

/**
 * Lista los modelos que la clave puede usar con generateContent.
 * Lanza AiError('INVALID_KEY') si Google rechaza la clave.
 */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const fp = keyFingerprint(apiKey);
  const cached = modelCache.get(fp);
  if (cached && Date.now() - cached.at < MODEL_CACHE_TTL) return cached.models;

  let res: Response;
  try {
    res = await fetchWithTimeout(`${GEMINI_API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': apiKey } }, 8000);
  } catch {
    return FALLBACK_MODELS;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (isInvalidKeyResponse(res.status, body) || res.status === 400 || res.status === 403) {
      throw new AiError('INVALID_KEY', 'gemini', friendlyAiMessage('INVALID_KEY', 'gemini'), body.slice(0, 300));
    }
    return FALLBACK_MODELS;
  }

  const data = await res.json().catch(() => ({}));
  const available: string[] = (data.models || [])
    .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m: any) => String(m.name || '').replace(/^models\//, ''));

  const ranked = rankGeminiModels(available);
  const models = ranked.length > 0 ? ranked : FALLBACK_MODELS;
  modelCache.set(fp, { models, at: Date.now() });
  return models;
}

export interface GeminiJsonRequest {
  apiKey: string;
  systemPrompt: string;
  /** Partes del mensaje del usuario (texto e imágenes inlineData) */
  parts: any[];
  /** Esquema OpenAPI (formato responseSchema de Gemini) */
  responseSchema?: object;
  temperature?: number;
  /** Momento límite (epoch ms) para todos los intentos */
  deadline: number;
  maxModels?: number;
  /** Bajar el razonamiento interno para responder más rápido */
  fastThinking?: boolean;
  /** Tiempo máximo por modelo, para que uno lento no consuma todo el plazo */
  perCallTimeoutMs?: number;
  /** Leer imágenes en alta resolución (necesario para texto pequeño en capturas) */
  highResolutionImages?: boolean;
}

export interface AiJsonResult {
  data: any;
  model: string;
}

/**
 * Llama a Gemini probando modelos en orden hasta obtener un JSON válido.
 * Se detiene de inmediato si la clave es inválida (no tiene sentido seguir probando).
 */
export async function geminiGenerateJson(req: GeminiJsonRequest): Promise<AiJsonResult> {
  const models = (await listGeminiModels(req.apiKey)).slice(0, req.maxModels ?? 5);
  const failures: ModelFailure[] = [];
  const queue = [...models];
  let retriedAfterOverload = false;

  while (queue.length > 0) {
    const model = queue.shift()!;
    // Primer intento con esquema estructurado; si el modelo lo rechaza (400), se reintenta sin extras
    const variants = [true, false];
    for (const full of variants) {
      const remaining = req.deadline - Date.now();
      if (remaining < 4000) break;

      const isGemini3 = /gemini-3|latest/.test(model);
      const generationConfig: Record<string, unknown> = { responseMimeType: 'application/json' };
      // Google recomienda no bajar la temperatura en Gemini 3 (con valores bajos rinde peor)
      if (!isGemini3) generationConfig.temperature = req.temperature ?? 0.1;
      if (full && req.responseSchema) generationConfig.responseSchema = req.responseSchema;
      if (full && req.fastThinking && isGemini3) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
      if (full && req.highResolutionImages) generationConfig.mediaResolution = 'MEDIA_RESOLUTION_HIGH';

      let res: Response;
      try {
        res = await fetchWithTimeout(
          `${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': req.apiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: req.systemPrompt }] },
              contents: [{ role: 'user', parts: req.parts }],
              generationConfig,
            }),
          },
          Math.min(remaining - 1000, req.perCallTimeoutMs ?? 45000)
        );
      } catch (err) {
        failures.push({ model, code: isAbortError(err) ? 'TIMEOUT' : 'NETWORK', detail: String(err) });
        break; // probar el siguiente modelo
      }

      if (res.ok) {
        const payload = await res.json().catch(() => null);
        const candidate = payload?.candidates?.[0];
        const text = (candidate?.content?.parts || [])
          .filter((p: any) => typeof p.text === 'string' && !p.thought)
          .map((p: any) => p.text)
          .join('');

        if (!text) {
          failures.push({ model, code: 'BAD_RESPONSE', detail: `Sin texto (finishReason: ${candidate?.finishReason || payload?.promptFeedback?.blockReason || 'desconocido'})` });
          break;
        }
        try {
          return { data: extractJson(text), model };
        } catch {
          failures.push({ model, code: 'BAD_RESPONSE', detail: text.slice(0, 200) });
          break;
        }
      }

      const body = await res.text().catch(() => '');
      if (isInvalidKeyResponse(res.status, body)) {
        throw new AiError('INVALID_KEY', 'gemini', friendlyAiMessage('INVALID_KEY', 'gemini'), body.slice(0, 300));
      }
      if (res.status === 400 && full) {
        continue; // reintentar el mismo modelo sin esquema/razonamiento
      }
      // 503 "high demand" es habitual en el plan gratuito: se pasa al siguiente modelo (los Lite suelen estar libres)
      const code = res.status === 429 ? 'QUOTA' : res.status >= 500 ? 'OVERLOADED' : 'NO_MODEL';
      failures.push({ model, code, detail: `${res.status}: ${body.slice(0, 200)}` });
      break;
    }

    // Si TODOS estaban saturados, esperar un momento y reintentar los mejores (los picos suelen durar segundos)
    const allOverloaded = failures.length > 0 && failures.every((f) => f.code === 'OVERLOADED');
    if (queue.length === 0 && !retriedAfterOverload && allOverloaded && req.deadline - Date.now() > 20_000) {
      retriedAfterOverload = true;
      await new Promise((resolve) => setTimeout(resolve, 2500));
      queue.push(...models.slice(0, 3));
    }
  }

  throw failuresToError('gemini', failures);
}
