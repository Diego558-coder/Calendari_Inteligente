import localforage from 'localforage';
import type { ScheduleEvent } from '@/types/schedule';

localforage.config({
  name: 'MiHorario',
  storeName: 'events',
  driver: [localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE],
});

const STORAGE_KEY_EVENTS = 'mihorario_events_v1';
const STORAGE_KEY_APIKEY = 'mihorario_gemini_key_v1';
const STORAGE_KEY_THEME = 'mihorario_theme_v1';
const STORAGE_KEY_TIMEZONE = 'mihorario_timezone_v1';

export const storage = {
  // Eventos
  getEvents: async (): Promise<ScheduleEvent[]> => {
    try {
      const events = await localforage.getItem<ScheduleEvent[]>(STORAGE_KEY_EVENTS);
      return events || [];
    } catch {
      return [];
    }
  },

  setEvents: async (events: ScheduleEvent[]): Promise<void> => {
    await localforage.setItem(STORAGE_KEY_EVENTS, events);
  },

  // API Key de Gemini
  getApiKey: async (): Promise<string> => {
    try {
      const key = await localforage.getItem<string>(STORAGE_KEY_APIKEY);
      return key || '';
    } catch {
      return '';
    }
  },

  setApiKey: async (key: string): Promise<void> => {
    await localforage.setItem(STORAGE_KEY_APIKEY, key);
  },

  // Tema
  getTheme: async (): Promise<'light' | 'dark' | 'system'> => {
    try {
      const theme = await localforage.getItem<'light' | 'dark' | 'system'>(STORAGE_KEY_THEME);
      return theme || 'system';
    } catch {
      return 'system';
    }
  },

  setTheme: async (theme: 'light' | 'dark' | 'system'): Promise<void> => {
    await localforage.setItem(STORAGE_KEY_THEME, theme);
  },

  // Zona horaria
  getTimezone: async (): Promise<string> => {
    try {
      const tz = await localforage.getItem<string>(STORAGE_KEY_TIMEZONE);
      return tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  },

  setTimezone: async (timezone: string): Promise<void> => {
    await localforage.setItem(STORAGE_KEY_TIMEZONE, timezone);
  },

  // Limpiar todo
  clearAll: async (): Promise<void> => {
    await localforage.clear();
  },

  // Genéricos para otros datos
  getItem: async <T>(key: string): Promise<T | null> => {
    try {
      return await localforage.getItem<T>(key);
    } catch {
      return null;
    }
  },

  setItem: async (key: string, value: unknown): Promise<void> => {
    await localforage.setItem(key, value);
  },
};