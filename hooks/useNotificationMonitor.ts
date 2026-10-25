'use client';

import { useEffect } from 'react';
import { ScheduleEvent } from '@/types/schedule';
import { DAYS_OF_WEEK, formatLeadTime, timeToMinutes } from '@/lib/schedule-utils';
import { getZonedNow } from '@/lib/timezone';
import { showLocalNotification } from '@/lib/push-client';

const SENT_KEY = 'mihorario_local_reminders_v2';

function readSent(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeSent(sent: Record<string, number>) {
  // Conservar solo los últimos 2 días
  const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const pruned = Object.fromEntries(Object.entries(sent).filter(([, at]) => at > cutoff));
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(pruned));
  } catch {}
}

/**
 * Avisos mientras la app está abierta. Se usa cuando el servidor no puede enviar push programado
 * (sin base de datos) o en navegadores sin push. Si el push programado está activo, se desactiva
 * para no duplicar avisos.
 */
export function useNotificationMonitor(events: ScheduleEvent[], alarmMinutes: number, timezone: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled || alarmMinutes <= 0) return;
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;

    const checkUpcoming = () => {
      const now = getZonedNow(timezone);
      const todayKey = DAYS_OF_WEEK[now.dayIndex].key;
      const sent = readSent();
      let changed = false;

      events
        .filter((e) => e.dayOfWeek === todayKey)
        .forEach((e) => {
          const diff = timeToMinutes(e.startTime) - now.minutes;
          const key = `${e.id}:${now.dateISO}:${e.startTime}`;
          if (diff > 0 && diff <= alarmMinutes && !sent[key]) {
            const kind = e.type === 'university' ? 'Clase' : e.type === 'work' ? 'Turno de trabajo' : 'Actividad';
            showLocalNotification(`🔔 ${e.title} en ${diff < 60 ? `${diff} min` : formatLeadTime(diff)}`, {
              body: `${kind} de ${e.startTime} a ${e.endTime}${e.location ? ` · ${e.location}` : ''}`,
              tag: `mh-${e.id}-${now.dateISO}`,
              url: '/?tab=agenda',
            }).catch(() => {});
            sent[key] = Date.now();
            changed = true;
          }
        });

      if (changed) writeSent(sent);
    };

    checkUpcoming();
    const interval = setInterval(checkUpcoming, 30_000);
    return () => clearInterval(interval);
  }, [events, alarmMinutes, timezone, enabled]);
}
