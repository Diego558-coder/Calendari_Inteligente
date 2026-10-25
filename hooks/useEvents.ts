'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ScheduleEvent } from '@/types/schedule';
import { storage } from '@/lib/storage';
import { sanitizeEvents } from '@/lib/schedule-utils';

export function useEvents() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const eventsRef = useRef<ScheduleEvent[]>([]);

  // Cargar datos de IndexedDB
  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      try {
        const [savedEvents, savedUpdatedAt] = await Promise.all([storage.getEvents(), storage.getEventsUpdatedAt()]);
        if (mounted) {
          const clean = sanitizeEvents(savedEvents || []);
          eventsRef.current = clean;
          setEvents(clean);
          setUpdatedAt(savedUpdatedAt);
        }
      } finally {
        if (mounted) setIsLoaded(true);
      }
    };
    loadData();
    return () => { mounted = false; };
  }, []);

  /**
   * Reemplaza todos los eventos y los guarda.
   * `remoteUpdatedAt` se usa cuando los datos vienen de otro dispositivo (conserva su marca de tiempo).
   */
  const updateEvents = useCallback(async (newEvents: ScheduleEvent[], remoteUpdatedAt?: number) => {
    const stamp = remoteUpdatedAt ?? Date.now();
    eventsRef.current = newEvents;
    setEvents(newEvents);
    setUpdatedAt(stamp);
    await Promise.all([storage.setEvents(newEvents), storage.setEventsUpdatedAt(stamp)]);
  }, []);

  /** Versión funcional: calcula el nuevo estado a partir del actual (evita cierres obsoletos) */
  const modifyEvents = useCallback(
    (modifier: (current: ScheduleEvent[]) => ScheduleEvent[]) => updateEvents(modifier(eventsRef.current)),
    [updateEvents]
  );

  return {
    events,
    updatedAt,
    isLoaded,
    updateEvents,
    modifyEvents,
  };
}
