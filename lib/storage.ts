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

const STORAGE_KEY_EVENTS = 'mihorario_events_v1';
const STORAGE_KEY_APIKEY = 'mihorario_gemini_key_v1';
const STORAGE_KEY_THEME = 'mihorario_theme_v1';
const STORAGE_KEY_TIMEZONE = 'mihorario_timezone_v1';

// Helper para verificar si estamos en el cliente
const isClient = typeof window !== 'undefined';

async function safeGetItem<T>(key: string, fallback: T): Promise<T> {
  if (!isClient) return fallback;
  try {
    const value = await localforage.getItem<T>(key);
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
    // Silenciosamente fallar en SSR
  }
}

export const storage = {
  // Eventos
  getEvents: (): Promise<ScheduleEvent[]> => safeGetItem<ScheduleEvent[]>(STORAGE_KEY_EVENTS, []),

  setEvents: (events: ScheduleEvent[]): Promise<void> => safeSetItem(STORAGE_KEY_EVENTS, events),

  // API Key de Gemini
  getApiKey: (): Promise<string> => safeGetItem<string>(STORAGE_KEY_APIKEY, ''),

  setApiKey: (key: string): Promise<void> => safeSetItem(STORAGE_KEY_APIKEY, key),

  // Tema
  getTheme: (): Promise<'light' | 'dark' | 'system'> => safeGetItem<'light' | 'dark' | 'system'>(STORAGE_KEY_THEME, 'system'),

  setTheme: (theme: 'light' | 'dark' | 'system'): Promise<void> => safeSetItem(STORAGE_KEY_THEME, theme),

  // Zona horaria
  getTimezone: (): Promise<string> => safeGetItem<string>(STORAGE_KEY_TIMEZONE, Intl.DateTimeFormat().resolvedOptions().timeZone),

  setTimezone: (timezone: string): Promise<void> => safeSetItem(STORAGE_KEY_TIMEZONE, timezone),

  // Limpiar todo
  clearAll: (): Promise<void> => {
    if (!isClient) return Promise.resolve();
    return localforage.clear().catch(() => {});
  },

  // Genéricos para otros datos
  getItem: <T>(key: string): Promise<T | null> => safeGetItem<T | null>(key, null),

  setItem: (key: string, value: unknown): Promise<void> => safeSetItem(key, value),
};