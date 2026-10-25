'use client';

import { useCallback, useEffect, useState } from 'react';
import { storage, STORAGE_KEYS } from '@/lib/storage';
import { detectTimezone } from '@/lib/timezone';

export interface AppSettings {
  geminiKey: string;
  groqKey: string;
  /** Minutos de anticipación de los avisos (notificaciones y alarmas del calendario) */
  alarmMinutes: number;
  timezone: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  geminiKey: '',
  groqKey: '',
  alarmMinutes: 60,
  timezone: 'America/Bogota',
};

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const saved = await storage.getItem<Partial<AppSettings>>(STORAGE_KEYS.settings);
      let next: AppSettings = { ...DEFAULT_SETTINGS, timezone: detectTimezone(), ...(saved || {}) };

      // Migrar datos de la versión anterior de la app
      if (!saved) {
        const [legacyGemini, legacyGroq] = await Promise.all([
          storage.getItem<string>(STORAGE_KEYS.legacyGeminiKey),
          storage.getItem<string>(STORAGE_KEYS.legacyGroqKey),
        ]);
        let legacyTimezone: string | null = null;
        try {
          legacyTimezone = localStorage.getItem('userTimezone');
        } catch {}
        next = {
          ...next,
          geminiKey: legacyGemini || '',
          groqKey: legacyGroq || '',
          ...(legacyTimezone ? { timezone: legacyTimezone } : {}),
        };
        await storage.setItem(STORAGE_KEYS.settings, next);
      }

      if (mounted) {
        setSettings(next);
        setIsLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      storage.setItem(STORAGE_KEYS.settings, next);
      return next;
    });
  }, []);

  return { settings, updateSettings, isLoaded };
}
