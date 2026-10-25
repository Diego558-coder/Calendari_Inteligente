import localforage from 'localforage';
import type { ScheduleEvent } from '@/types/schedule';

// Configurar localforage solo en el cliente
if (typeof window !== 'undefined') {
  localforage.config({
    name: 'MiHorario',
    storeName: 'events',
    driver: [localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE],
  });
}

export const STORAGE_KEYS = {
  events: 'mihorario_events_v1',
  eventsUpdatedAt: 'mihorario_events_updated_at_v1',
  settings: 'mihorario_settings_v2',
  cloud: 'mihorario_cloud_v2',
  // Claves de versiones anteriores (se migran a settings)
  legacyGeminiKey: 'mihorario_gemini_key_v1',
  legacyGroqKey: 'mihorario_groq_key_v1',
} as const;

// Helper para verificar si estamos en el cliente
const isClient = typeof window !== 'undefined';

async function safeGetItem<T>(key: string, fallback: T): Promise<T> {
  if (!isClient) return fallback;
  try {
    // Si IndexedDB queda bloqueado (otra pestaña vieja, modo privado), no dejar la app cargando para siempre
    const value = await Promise.race([
      localforage.getItem<T>(key),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

async function safeSetItem(key: string, value: unknown): Promise<void> {
  if (!isClient) return;
  try {
    await localforage.setItem(key, value);
  } catch {
    // Silenciosamente fallar en SSR o en modo privado sin almacenamiento
  }
}

export const storage = {
  /** Eventos guardados, o null si el usuario nunca guardó nada (primera visita) */
  getEvents: (): Promise<ScheduleEvent[] | null> => safeGetItem<ScheduleEvent[] | null>(STORAGE_KEYS.events, null),

  setEvents: (events: ScheduleEvent[]): Promise<void> => safeSetItem(STORAGE_KEYS.events, events),

  getEventsUpdatedAt: (): Promise<number> => safeGetItem<number>(STORAGE_KEYS.eventsUpdatedAt, 0),

  setEventsUpdatedAt: (timestamp: number): Promise<void> => safeSetItem(STORAGE_KEYS.eventsUpdatedAt, timestamp),

  // Limpiar todo
  clearAll: (): Promise<void> => {
    if (!isClient) return Promise.resolve();
    return localforage.clear().catch(() => {});
  },

  // Genéricos para otros datos
  getItem: <T>(key: string): Promise<T | null> => safeGetItem<T | null>(key, null),

  setItem: (key: string, value: unknown): Promise<void> => safeSetItem(key, value),

  removeItem: (key: string): Promise<void> => {
    if (!isClient) return Promise.resolve();
    return localforage.removeItem(key).catch(() => {});
  },
};
