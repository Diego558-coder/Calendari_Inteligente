'use client';

import { useState, useEffect, useCallback } from 'react';
import { ScheduleEvent } from '@/types/schedule';
import { storage } from '@/lib/storage';
import { DEMO_EVENTS } from '@/lib/demo-data';

export function useEvents() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Cargar datos de IndexedDB
  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      if (typeof window !== 'undefined') {
        try {
          const savedEvents = await storage.getEvents();
          if (mounted) {
            if (savedEvents.length > 0) {
              setEvents(savedEvents);
            } else {
              setEvents(DEMO_EVENTS);
            }
          }
        } catch {
          if (mounted) setEvents(DEMO_EVENTS);
        } finally {
          if (mounted) setIsLoaded(true);
        }
      }
    };
    loadData();
    return () => { mounted = false; };
  }, []);

  // Guardar en IndexedDB cada vez que cambien los eventos
  const updateEvents = useCallback(async (newEvents: ScheduleEvent[]) => {
    setEvents(newEvents);
    if (typeof window !== 'undefined') {
      await storage.setEvents(newEvents);
    }
  }, []);

  const loadDemoData = useCallback(async () => {
    await updateEvents(DEMO_EVENTS);
  }, [updateEvents]);

  const clearAllData = useCallback(async () => {
    await updateEvents([]);
  }, [updateEvents]);

  const importEvents = useCallback(async (imported: ScheduleEvent[]) => {
    await updateEvents(imported);
  }, [updateEvents]);

  return {
    events,
    isLoaded,
    updateEvents,
    loadDemoData,
    clearAllData,
    importEvents,
  };
}