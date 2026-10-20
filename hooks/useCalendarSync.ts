'use client';

import { useState, useEffect, useCallback } from 'react';
import { ScheduleEvent } from '@/types/schedule';
import { storage } from '@/lib/storage';

const STORAGE_KEY_SYNC_ID = 'mihorario_sync_id_v1';

export function useCalendarSync(events: ScheduleEvent[]) {
  const [syncId, setSyncId] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [originUrl, setOriginUrl] = useState('');
  const [subscriberStatus, setSubscriberStatus] = useState<{
    enrolled: boolean;
    lastPing: number | null;
    userAgent: string | null;
    totalEvents: number;
    updatedAt: number | null;
  } | null>(null);

  useEffect(() => {
    setOriginUrl(window.location.host);
    const loadSyncId = async () => {
      const savedId = await storage.getItem(STORAGE_KEY_SYNC_ID);
      if (savedId) setSyncId(savedId);
    };
    loadSyncId();
  }, []);

  const checkSubscriberStatus = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const response = await fetch(`/api/calendar/status/${id}`);
      if (response.ok) setSubscriberStatus(await response.json());
    } catch (error) {
      console.warn('Error verificando suscriptores:', error);
    }
  }, []);

  const syncWithCloudFeed = useCallback(async (forcedEvents?: ScheduleEvent[]): Promise<string | null> => {
    const eventsToSync = forcedEvents || events;
    if (eventsToSync.length === 0) return null;

    setIsSyncing(true);
    try {
      const savedId = await storage.getItem(STORAGE_KEY_SYNC_ID);
      const response = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncId: savedId, events: eventsToSync }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.syncId) {
          setSyncId(data.syncId);
          await storage.setItem(STORAGE_KEY_SYNC_ID, data.syncId);
          checkSubscriberStatus(data.syncId);
          return data.syncId;
        }
      }
    } catch (error) {
      console.warn('Error sincronizando feed con la nube:', error);
    } finally {
      setIsSyncing(false);
    }
    return null;
  }, [checkSubscriberStatus, events]);

  // Sincronizar automáticamente cuando cambien los eventos
  useEffect(() => {
    if (events.length > 0) syncWithCloudFeed(events);
  }, [events, syncWithCloudFeed]);

  // Verificar estado del suscriptor periódicamente
  useEffect(() => {
    if (!syncId) return;
    checkSubscriberStatus(syncId);
    const interval = setInterval(() => checkSubscriberStatus(syncId), 15000);
    return () => clearInterval(interval);
  }, [checkSubscriberStatus, syncId]);

  return {
    syncId,
    isSyncing,
    originUrl,
    subscriberStatus,
    syncWithCloudFeed,
    checkSubscriberStatus,
  };
}