'use client';

import { useEffect } from 'react';
import { ScheduleEvent } from '@/types/schedule';
import { DAYS_OF_WEEK, timeToMinutes } from '@/lib/schedule-utils';

export function useNotificationMonitor(events: ScheduleEvent[]) {
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const notifiedTodayKey = `notified_events_${new Date().toDateString()}`;
    let notifiedIds: string[] = [];
    try {
      notifiedIds = JSON.parse(sessionStorage.getItem(notifiedTodayKey) || '[]');
    } catch {}

    const checkUpcoming = () => {
      const now = new Date();
      const currentDayIdx = (now.getDay() + 6) % 7;
      const currentDayKey = DAYS_OF_WEEK[currentDayIdx]?.key;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      events
        .filter((e) => e.dayOfWeek === currentDayKey)
        .forEach((e) => {
          const startMin = timeToMinutes(e.startTime);
          const diff = startMin - currentMinutes;

          // Avisar si la actividad empieza en los próximos 60 minutos (entre 45 y 60 min)
          if (diff > 0 && diff <= 60 && !notifiedIds.includes(e.id)) {
            const isUni = e.type === 'university';
            const title = `🔔 En ${diff} min: ${e.title}`;
            const body = `${isUni ? 'Clase universitaria' : 'Turno laboral'} de ${e.startTime} a ${e.endTime}${
              e.location ? ` en ${e.location}` : ''
            }.`;

            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
              navigator.serviceWorker.ready.then((reg) => {
                reg.showNotification(title, {
                  body,
                  icon: '/icon.svg',
                  badge: '/icon.svg',
                } as any);
              });
            } else {
              new Notification(title, { body, icon: '/icon.svg' });
            }

            notifiedIds.push(e.id);
            sessionStorage.setItem(notifiedTodayKey, JSON.stringify(notifiedIds));
          }
        });
    };

    checkUpcoming();
    const interval = setInterval(checkUpcoming, 60000); // Revisar cada minuto
    return () => clearInterval(interval);
  }, [events]);
}