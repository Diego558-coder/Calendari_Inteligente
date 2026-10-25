'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScheduleEvent } from '@/types/schedule';
import { storage, STORAGE_KEYS } from '@/lib/storage';

export type CloudMode = 'live' | 'static';

export interface CloudCredentials {
  mode?: CloudMode;
  profileId?: string;
  writeKey?: string;
  feedToken?: string;
  lastSyncedAt?: number;
}

export interface RemoteSchedule {
  events: ScheduleEvent[];
  updatedAt: number;
  timezone?: string;
  alarmMinutes?: number;
}

interface UseCloudSyncOptions {
  events: ScheduleEvent[];
  updatedAt: number;
  timezone: string;
  alarmMinutes: number;
  /** Eventos y ajustes ya cargados del almacenamiento local */
  ready: boolean;
  /** Se llama cuando otro dispositivo vinculado tiene una versión más reciente del horario */
  onRemoteChange: (remote: RemoteSchedule) => void;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface CloudUrls {
  feedUrl: string;
  webcalUrl: string;
  googleUrl: string;
  linkUrl: string;
}

/** Enlaces del calendario suscrito y de vinculación a partir de las credenciales */
export function buildCloudUrls(credentials: CloudCredentials | null, origin: string): CloudUrls | null {
  if (!credentials || !origin) return null;
  const feedId = credentials.mode === 'live' ? credentials.profileId : credentials.mode === 'static' ? credentials.feedToken : undefined;
  if (!feedId) return null;
  const feedUrl = `${origin}/api/calendar/feed/${feedId}.ics`;
  const webcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://');
  return {
    feedUrl,
    webcalUrl,
    googleUrl: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`,
    // El fragmento (#) no se envía al servidor, así la clave no queda en registros
    linkUrl: credentials.mode === 'live'
      ? `${origin}/#vincular=${credentials.profileId}.${credentials.writeKey}`
      : `${origin}/#importar=${credentials.feedToken}`,
  };
}

/**
 * Mantiene una copia del horario en el servidor. Esa copia alimenta:
 * el calendario suscrito del celular, las notificaciones push programadas y la vinculación con otros dispositivos.
 */
export function useCloudSync({ events, updatedAt, timezone, alarmMinutes, ready, onRemoteChange }: UseCloudSyncOptions) {
  const [credentials, setCredentials] = useState<CloudCredentials>({});
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  const [initialized, setInitialized] = useState(false);

  const credentialsRef = useRef<CloudCredentials>({});
  const latest = useRef({ events, updatedAt, timezone, alarmMinutes });
  latest.current = { events, updatedAt, timezone, alarmMinutes };
  const onRemoteChangeRef = useRef(onRemoteChange);
  onRemoteChangeRef.current = onRemoteChange;
  const inFlight = useRef<Promise<CloudCredentials | null> | null>(null);

  const saveCredentials = useCallback(async (next: CloudCredentials) => {
    credentialsRef.current = next;
    setCredentials(next);
    await storage.setItem(STORAGE_KEYS.cloud, next);
  }, []);

  /** Envía el horario actual al servidor. Devuelve las credenciales vigentes. */
  const syncNow = useCallback(async (options: { force?: boolean } = {}): Promise<CloudCredentials | null> => {
    if (inFlight.current) return inFlight.current;

    const run = async (): Promise<CloudCredentials | null> => {
      const current = credentialsRef.current;
      const data = latest.current;
      setStatus('syncing');
      try {
        const response = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: current.mode === 'live' ? current.profileId : undefined,
            writeKey: current.mode === 'live' ? current.writeKey : undefined,
            events: data.events,
            timezone: data.timezone,
            alarmMinutes: data.alarmMinutes,
            updatedAt: data.updatedAt || Date.now(),
            force: options.force,
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'No se pudo sincronizar');

        let next: CloudCredentials;
        if (result.mode === 'static') {
          next = { mode: 'static', feedToken: result.feedToken, lastSyncedAt: Date.now() };
        } else {
          next = {
            mode: 'live',
            profileId: result.profileId,
            writeKey: result.writeKey || current.writeKey,
            lastSyncedAt: Date.now(),
          };
          if (result.conflict) {
            onRemoteChangeRef.current({
              events: result.events,
              updatedAt: result.updatedAt,
              timezone: result.timezone,
              alarmMinutes: result.alarmMinutes,
            });
          }
        }
        await saveCredentials(next);
        setStatus('synced');
        setError(null);
        return next;
      } catch (err: any) {
        setStatus('error');
        setError(err?.message || 'Sin conexión con el servidor');
        return null;
      }
    };

    inFlight.current = run().finally(() => {
      inFlight.current = null;
    });
    return inFlight.current;
  }, [saveCredentials]);

  // 1) Cargar credenciales guardadas y traer cambios hechos en otros dispositivos
  useEffect(() => {
    if (!ready || initialized) return;
    setOrigin(window.location.origin);
    (async () => {
      const saved = (await storage.getItem<CloudCredentials>(STORAGE_KEYS.cloud)) || {};
      credentialsRef.current = saved;
      setCredentials(saved);

      if (saved.mode === 'live' && saved.profileId && saved.writeKey) {
        try {
          const response = await fetch('/api/sync/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId: saved.profileId, writeKey: saved.writeKey }),
          });
          const result = await response.json();
          if (response.ok && result.success && result.updatedAt > latest.current.updatedAt) {
            onRemoteChangeRef.current(result);
          } else if (response.status === 404) {
            // El perfil ya no existe en el servidor: se creará uno nuevo en la próxima sincronización
            await saveCredentials({});
          }
        } catch {
          // Sin conexión: se reintentará al sincronizar
        }
      }
      setInitialized(true);
    })();
  }, [ready, initialized, saveCredentials]);

  // 2) Subir cambios (con una pequeña espera para agrupar ediciones seguidas)
  useEffect(() => {
    if (!initialized) return;
    const hasProfile = Boolean(credentialsRef.current.mode);
    // No crear nada en el servidor mientras el horario esté vacío y nunca se haya sincronizado
    if (!hasProfile && events.length === 0) return;
    const timer = setTimeout(() => {
      syncNow();
    }, 1200);
    return () => clearTimeout(timer);
  }, [initialized, events, updatedAt, timezone, alarmMinutes, syncNow]);

  /** Adopta un horario vinculado desde otro dispositivo (enlace o QR) */
  const linkProfile = useCallback(async (profileId: string, writeKey: string): Promise<RemoteSchedule> => {
    const response = await fetch('/api/sync/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, writeKey }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'No se pudo vincular el dispositivo');
    await saveCredentials({ mode: 'live', profileId, writeKey, lastSyncedAt: Date.now() });
    return result;
  }, [saveCredentials]);

  /** Lee un enlace de importación del modo sin base de datos */
  const readImportToken = useCallback(async (token: string): Promise<RemoteSchedule> => {
    const response = await fetch('/api/sync/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'El enlace no es válido');
    return result;
  }, []);

  const urls = useMemo(() => buildCloudUrls(credentials, origin), [credentials, origin]);

  /** Devuelve los enlaces, sincronizando primero si todavía no existen */
  const ensureUrls = useCallback(async (): Promise<CloudUrls | null> => {
    const current = buildCloudUrls(credentialsRef.current, window.location.origin);
    if (current) return current;
    return buildCloudUrls(await syncNow(), window.location.origin);
  }, [syncNow]);

  return {
    credentials,
    mode: credentials.mode,
    status,
    error,
    urls,
    initialized,
    syncNow,
    ensureUrls,
    linkProfile,
    readImportToken,
  };
}

export type CloudSync = ReturnType<typeof useCloudSync>;
