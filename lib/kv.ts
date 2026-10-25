/**
 * Almacenamiento clave-valor en Upstash Redis usando su API REST (sin dependencias).
 *
 * Upstash tiene plan gratuito y se conecta en 1 clic desde Vercel → Storage → Upstash for Redis,
 * que crea automáticamente las variables KV_REST_API_URL / KV_REST_API_TOKEN
 * (o UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN si se crea desde upstash.com).
 *
 * En desarrollo local, si no hay credenciales, se usa un almacén en memoria para poder probar todo.
 */

type RedisCommand = (string | number)[];

const REST_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const useMemory = !REST_URL && process.env.NODE_ENV === 'development';

export function isKvConfigured(): boolean {
  return Boolean(REST_URL && REST_TOKEN) || useMemory;
}

// ---- Almacén en memoria (solo `next dev`) ----
const globalStore = globalThis as unknown as { __mihorarioMemoryKv?: { data: Map<string, string>; sets: Map<string, Set<string>>; expires: Map<string, number> } };
const memory = (globalStore.__mihorarioMemoryKv ||= { data: new Map(), sets: new Map(), expires: new Map() });

function memoryExpired(key: string): boolean {
  const at = memory.expires.get(key);
  if (at && Date.now() > at) {
    memory.data.delete(key);
    memory.expires.delete(key);
    return true;
  }
  return false;
}

function runMemory(cmd: RedisCommand): unknown {
  const [name, ...args] = cmd.map(String);
  switch (name.toUpperCase()) {
    case 'GET':
      return memoryExpired(args[0]) ? null : memory.data.get(args[0]) ?? null;
    case 'SET': {
      const [key, value, ...opts] = args;
      const upper = opts.map((o) => o.toUpperCase());
      if (upper.includes('NX') && !memoryExpired(key) && memory.data.has(key)) return null;
      memory.data.set(key, value);
      const exIndex = upper.indexOf('EX');
      if (exIndex >= 0) memory.expires.set(key, Date.now() + Number(opts[exIndex + 1]) * 1000);
      else memory.expires.delete(key);
      return 'OK';
    }
    case 'DEL':
      return args.reduce((n, key) => n + (memory.data.delete(key) ? 1 : 0) + (memory.sets.delete(key) ? 1 : 0), 0);
    case 'SADD': {
      const set = memory.sets.get(args[0]) || new Set<string>();
      const before = set.size;
      args.slice(1).forEach((m) => set.add(m));
      memory.sets.set(args[0], set);
      return set.size - before;
    }
    case 'SREM': {
      const set = memory.sets.get(args[0]);
      if (!set) return 0;
      return args.slice(1).reduce((n, m) => n + (set.delete(m) ? 1 : 0), 0);
    }
    case 'SMEMBERS':
      return Array.from(memory.sets.get(args[0]) || []);
    case 'MGET':
      return args.map((key) => (memoryExpired(key) ? null : memory.data.get(key) ?? null));
    default:
      throw new Error(`Comando no soportado en memoria: ${name}`);
  }
}

// ---- Cliente REST de Upstash ----
async function runRest<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${REST_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Upstash ${res.status}: ${data?.error || 'error desconocido'}`);
  }
  return data as T;
}

async function command<T = unknown>(cmd: RedisCommand): Promise<T> {
  if (!isKvConfigured()) throw new Error('KV_NOT_CONFIGURED');
  if (useMemory) return runMemory(cmd) as T;
  const data = await runRest<{ result?: T; error?: string }>('', cmd);
  if (data.error) throw new Error(`Upstash: ${data.error}`);
  return data.result as T;
}

function parse<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return null;
  }
}

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    return parse<T>(await command(['GET', key]));
  },

  /** Guarda JSON. `nx` = solo si no existe (devuelve false si ya existía). */
  async set(key: string, value: unknown, options: { ex?: number; nx?: boolean } = {}): Promise<boolean> {
    const cmd: RedisCommand = ['SET', key, JSON.stringify(value)];
    if (options.ex) cmd.push('EX', options.ex);
    if (options.nx) cmd.push('NX');
    return (await command(cmd)) === 'OK';
  },

  async del(key: string): Promise<void> {
    await command(['DEL', key]);
  },

  async sadd(key: string, member: string): Promise<void> {
    await command(['SADD', key, member]);
  },

  async srem(key: string, member: string): Promise<void> {
    await command(['SREM', key, member]);
  },

  async smembers(key: string): Promise<string[]> {
    return (await command<string[]>(['SMEMBERS', key])) || [];
  },

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    const raw = await command<unknown[]>(['MGET', ...keys]);
    return (raw || []).map((value) => parse<T>(value));
  },
};
