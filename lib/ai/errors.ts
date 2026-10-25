import type { AiProvider } from '@/types/schedule';

export type AiErrorCode =
  | 'NO_KEY'        // No hay clave configurada para el proveedor
  | 'INVALID_KEY'   // La clave fue rechazada (401/403 o API_KEY_INVALID)
  | 'QUOTA'         // Se agotó la cuota gratuita (429)
  | 'OVERLOADED'    // Servidores saturados o caídos (500/503)
  | 'NO_MODEL'      // Ningún modelo compatible respondió
  | 'TIMEOUT'       // El proveedor tardó demasiado
  | 'BAD_RESPONSE'  // Respondió algo que no es el JSON esperado
  | 'NETWORK';      // No se pudo conectar

export const PROVIDER_NAMES: Record<AiProvider, string> = {
  gemini: 'Google Gemini',
  groq: 'Groq',
};

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    public provider: AiProvider,
    message: string,
    public detail?: string
  ) {
    super(message);
    this.name = 'AiError';
  }
}

/** Mensaje en español, entendible para el usuario final */
export function friendlyAiMessage(code: AiErrorCode, provider: AiProvider): string {
  const name = PROVIDER_NAMES[provider];
  switch (code) {
    case 'NO_KEY':
      return `No hay clave de ${name} configurada.`;
    case 'INVALID_KEY':
      return `La clave de ${name} no es válida o fue revocada. Revísala en Ajustes.`;
    case 'QUOTA':
      return `Se agotó por ahora la cuota gratuita de ${name}. Espera unos minutos o usa la otra IA en Ajustes.`;
    case 'OVERLOADED':
      return `Los servidores gratuitos de ${name} están saturados en este momento. Intenta de nuevo en unos minutos (tener también la otra IA en Ajustes sirve de respaldo).`;
    case 'TIMEOUT':
      return `${name} tardó demasiado en responder. Intenta de nuevo.`;
    case 'NO_MODEL':
      return `${name} no tiene ahora mismo un modelo gratuito disponible para esta tarea.`;
    case 'BAD_RESPONSE':
      return `${name} respondió en un formato inesperado. Intenta de nuevo.`;
    case 'NETWORK':
    default:
      return `No se pudo conectar con ${name}. Revisa tu conexión.`;
  }
}

/** Cuerpo y estado HTTP de la respuesta de error de las rutas de IA (con detalle técnico para diagnosticar) */
export function aiErrorResponse(err: AiError): { body: Record<string, unknown>; status: number } {
  const status = err.code === 'QUOTA' ? 429 : err.code === 'OVERLOADED' ? 503 : err.code === 'INVALID_KEY' || err.code === 'NO_KEY' ? 422 : 502;
  const detail = err.detail
    ?.replace(/AIza[0-9A-Za-z_-]{20,}|gsk_[0-9A-Za-z]{20,}/g, '[clave]')
    .replace(/\s+/g, ' ')
    .slice(0, 1200);
  return { body: { success: false, error: err.message, code: err.code, ...(detail ? { detail } : {}) }, status };
}

export interface ModelFailure {
  model: string;
  code: AiErrorCode;
  detail: string;
}

/** Convierte los fallos de cada modelo probado en un único error con el motivo más útil para el usuario */
export function failuresToError(provider: AiProvider, failures: ModelFailure[]): AiError {
  const all = (code: AiErrorCode) => failures.length > 0 && failures.every((f) => f.code === code);
  const some = (code: AiErrorCode) => failures.some((f) => f.code === code);
  const code: AiErrorCode = all('QUOTA') ? 'QUOTA'
    : some('OVERLOADED') ? 'OVERLOADED'
    : some('TIMEOUT') ? 'TIMEOUT'
    : some('BAD_RESPONSE') ? 'BAD_RESPONSE'
    : all('NETWORK') ? 'NETWORK'
    : some('QUOTA') ? 'QUOTA'
    : 'NO_MODEL';
  console.warn(`[${provider}] Ningún modelo respondió:`, failures);
  return new AiError(code, provider, friendlyAiMessage(code, provider), failures.map((f) => `${f.model} → ${f.detail}`).join(' | '));
}

/** fetch con límite de tiempo (los modelos con razonamiento pueden tardar) */
export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

/**
 * Extrae el primer objeto JSON de un texto. Tolera bloques ```json, texto alrededor
 * y etiquetas <think> de modelos con razonamiento.
 */
export function extractJson<T = any>(text: string): T {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        // seguir intentando
      }
    }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('La respuesta no contiene JSON');
  }
}
