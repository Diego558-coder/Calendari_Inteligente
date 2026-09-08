import { DayOfWeek, EventType, FreeTimeSlot, ScheduleConflict, ScheduleEvent, ScheduleStats } from '@/types/schedule';

export const DAYS_OF_WEEK: { key: DayOfWeek; label: string; short: string }[] = [
  { key: 'lunes', label: 'Lunes', short: 'Lun' },
  { key: 'martes', label: 'Martes', short: 'Mar' },
  { key: 'miercoles', label: 'Miércoles', short: 'Mié' },
  { key: 'jueves', label: 'Jueves', short: 'Jue' },
  { key: 'viernes', label: 'Viernes', short: 'Vie' },
  { key: 'sabado', label: 'Sábado', short: 'Sáb' },
  { key: 'domingo', label: 'Domingo', short: 'Dom' },
];

/**
 * Normaliza cualquier variante de texto del día al tipo DayOfWeek estándar
 */
export function normalizeDay(rawDay: string): DayOfWeek {
  const clean = (rawDay || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (clean.startsWith('lun') || clean.includes('mon')) return 'lunes';
  if (clean.startsWith('mar') || clean.includes('tue')) return 'martes';
  if (clean.startsWith('mie') || clean.includes('wed')) return 'miercoles';
  if (clean.startsWith('jue') || clean.includes('thu')) return 'jueves';
  if (clean.startsWith('vie') || clean.includes('fri')) return 'viernes';
  if (clean.startsWith('sab') || clean.includes('sat')) return 'sabado';
  if (clean.startsWith('dom') || clean.includes('sun')) return 'domingo';

  return 'lunes';
}

/**
 * Convierte "HH:mm" (ej. "08:30") a minutos desde la medianoche
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

/**
 * Convierte minutos desde la medianoche a "HH:mm"
 */
export function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(1439, totalMinutes));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Detecta solapamientos y conflictos entre clases y trabajo
 */
export function detectConflicts(events: ScheduleEvent[]): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  // Agrupar eventos por día
  const byDay: Record<DayOfWeek, ScheduleEvent[]> = {
    lunes: [],
    martes: [],
    miercoles: [],
    jueves: [],
    viernes: [],
    sabado: [],
    domingo: [],
  };

  events.forEach((ev) => {
    byDay[ev.dayOfWeek].push(ev);
  });

  // Verificar pares de eventos en cada día
  for (const day of Object.keys(byDay) as DayOfWeek[]) {
    const dayEvents = byDay[day];
    for (let i = 0; i < dayEvents.length; i++) {
      for (let j = i + 1; j < dayEvents.length; j++) {
        const evA = dayEvents[i];
        const evB = dayEvents[j];

        const startA = timeToMinutes(evA.startTime);
        const endA = timeToMinutes(evA.endTime);
        const startB = timeToMinutes(evB.startTime);
        const endB = timeToMinutes(evB.endTime);

        // Se solapan si el inicio de uno es menor que el fin del otro en ambos sentidos
        if (startA < endB && startB < endA) {
          const overlapStart = Math.max(startA, startB);
          const overlapEnd = Math.min(endA, endB);
          const overlapMinutes = overlapEnd - overlapStart;

          conflicts.push({
            id: `conflict-${evA.id}-${evB.id}`,
            dayOfWeek: day,
            eventA: evA,
            eventB: evB,
            overlapMinutes,
            message: `Conflicto de ${overlapMinutes} min entre "${evA.title}" y "${evB.title}"`,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Calcula los huecos y horas libres disponibles en cada día de la semana
 * Por defecto busca huecos de al menos 30 minutos entre 07:00 y 22:00
 */
export function calculateFreeTimeSlots(
  events: ScheduleEvent[],
  dayStartMinutes = 7 * 60, // 07:00 AM
  dayEndMinutes = 22 * 60,  // 10:00 PM
  minSlotMinutes = 30
): FreeTimeSlot[] {
  const freeSlots: FreeTimeSlot[] = [];

  const byDay: Record<DayOfWeek, ScheduleEvent[]> = {
    lunes: [],
    martes: [],
    miercoles: [],
    jueves: [],
    viernes: [],
    sabado: [],
    domingo: [],
  };

  events.forEach((ev) => byDay[ev.dayOfWeek].push(ev));

  for (const day of Object.keys(byDay) as DayOfWeek[]) {
    const dayEvents = byDay[day];

    if (dayEvents.length === 0) {
      // Todo el día está libre
      const duration = dayEndMinutes - dayStartMinutes;
      freeSlots.push({
        id: `free-${day}-full`,
        dayOfWeek: day,
        startTime: minutesToTime(dayStartMinutes),
        endTime: minutesToTime(dayEndMinutes),
        durationMinutes: duration,
        label: `Día completamente libre (${(duration / 60).toFixed(1)} hrs)`,
      });
      continue;
    }

    // Ordenar eventos por hora de inicio
    const sorted = [...dayEvents].sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    );

    // Fusionar intervalos ocupados para no contar duplicados si hay solapamiento
    const busyIntervals: { start: number; end: number }[] = [];
    for (const ev of sorted) {
      const s = Math.max(dayStartMinutes, timeToMinutes(ev.startTime));
      const e = Math.min(dayEndMinutes, timeToMinutes(ev.endTime));
      if (s >= e) continue;

      if (busyIntervals.length === 0) {
        busyIntervals.push({ start: s, end: e });
      } else {
        const last = busyIntervals[busyIntervals.length - 1];
        if (s <= last.end) {
          last.end = Math.max(last.end, e);
        } else {
          busyIntervals.push({ start: s, end: e });
        }
      }
    }

    // Calcular hueco antes del primer evento
    let current = dayStartMinutes;
    busyIntervals.forEach((busy, idx) => {
      if (busy.start > current) {
        const gap = busy.start - current;
        if (gap >= minSlotMinutes) {
          const startStr = minutesToTime(current);
          const endStr = minutesToTime(busy.start);
          const hours = (gap / 60).toFixed(1);
          freeSlots.push({
            id: `free-${day}-${idx}`,
            dayOfWeek: day,
            startTime: startStr,
            endTime: endStr,
            durationMinutes: gap,
            label: `${hours}h libre (${startStr} a ${endStr})`,
          });
        }
      }
      current = Math.max(current, busy.end);
    });

    // Hueco después del último evento hasta dayEndMinutes
    if (dayEndMinutes > current) {
      const gap = dayEndMinutes - current;
      if (gap >= minSlotMinutes) {
        const startStr = minutesToTime(current);
        const endStr = minutesToTime(dayEndMinutes);
        const hours = (gap / 60).toFixed(1);
        freeSlots.push({
          id: `free-${day}-end`,
          dayOfWeek: day,
          startTime: startStr,
          endTime: endStr,
          durationMinutes: gap,
          label: `${hours}h libre (${startStr} a ${endStr})`,
        });
      }
    }
  }

  return freeSlots;
}

/**
 * Calcula estadísticas de ocupación y tiempo libre
 */
export function calculateStats(
  events: ScheduleEvent[],
  freeSlots: FreeTimeSlot[],
  conflicts: ScheduleConflict[]
): ScheduleStats {
  let universityMinutes = 0;
  let workMinutes = 0;

  events.forEach((ev) => {
    const dur = Math.max(0, timeToMinutes(ev.endTime) - timeToMinutes(ev.startTime));
    if (ev.type === 'university') universityMinutes += dur;
    else if (ev.type === 'work') workMinutes += dur;
  });

  const totalFreeMinutes = freeSlots.reduce((acc, slot) => acc + slot.durationMinutes, 0);

  return {
    universityHours: Math.round((universityMinutes / 60) * 10) / 10,
    workHours: Math.round((workMinutes / 60) * 10) / 10,
    freeHours: Math.round((totalFreeMinutes / 60) * 10) / 10,
    totalActivities: events.length,
    conflictsCount: conflicts.length,
  };
}

/**
 * Asigna día de la semana (Lunes=1 ... Domingo=0 en Date de JS) para fechas recurrentes
 */
function getDayOffset(day: DayOfWeek): number {
  switch (day) {
    case 'lunes': return 1;
    case 'martes': return 2;
    case 'miercoles': return 3;
    case 'jueves': return 4;
    case 'viernes': return 5;
    case 'sabado': return 6;
    case 'domingo': return 0;
  }
}

/**
 * Genera el archivo universal .ics (iCalendar) con alarma de 1 hora antes (TRIGGER:-PT60M)
 * Compatible con Google Calendar, Apple Calendar y Outlook móvil
 */
export function generateICS(events: ScheduleEvent[], alarmMinutesBefore = 60): string {
  const dayCodeMap: Record<DayOfWeek, string> = {
    lunes: 'MO',
    martes: 'TU',
    miercoles: 'WE',
    jueves: 'TH',
    viernes: 'FR',
    sabado: 'SA',
    domingo: 'SU',
  };

  // Base date: próximo lunes
  const now = new Date();
  const currentDay = now.getDay(); // 0 es domingo, 1 es lunes...
  const daysUntilNextMonday = (8 - currentDay) % 7 || 7;
  const baseMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilNextMonday);

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calendario Dinamico IA//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Horario Universidad y Trabajo',
    'X-WR-TIMEZONE:America/Bogota',
  ];

  events.forEach((ev) => {
    const dayOffset = (getDayOffset(ev.dayOfWeek) - 1 + 7) % 7;
    const eventDate = new Date(baseMonday);
    eventDate.setDate(eventDate.getDate() + dayOffset);

    const [startH, startM] = ev.startTime.split(':').map(Number);
    const [endH, endM] = ev.endTime.split(':').map(Number);

    const start = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), startH, startM);
    const end = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), endH, endM);

    const pad = (n: number) => n.toString().padStart(2, '0');
    const formatICSDate = (d: Date) =>
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

    const dtStart = formatICSDate(start);
    const dtEnd = formatICSDate(end);
    const dtStamp = formatICSDate(new Date()) + 'Z';
    const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${dayCodeMap[ev.dayOfWeek]}`;

    const typeLabel = ev.type === 'university' ? '🎓 Universidad' : ev.type === 'work' ? '💼 Trabajo' : '📌 Actividad';
    const description = `${typeLabel}: ${ev.title}${ev.teacher ? `\\nProfesor/Jefe: ${ev.teacher}` : ''}${ev.notes ? `\\nNotas: ${ev.notes}` : ''}`;

    ics.push(
      'BEGIN:VEVENT',
      `UID:${ev.id}@calendario-ia.local`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      rrule,
      `SUMMARY:[${typeLabel}] ${ev.title}`,
      `DESCRIPTION:${description}`,
      ev.location ? `LOCATION:${ev.location}` : 'LOCATION:',
      'STATUS:CONFIRMED',
      // Alarma de notificación 1 hora antes (o los minutos configurados)
      'BEGIN:VALARM',
      `TRIGGER:-PT${alarmMinutesBefore}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:Recordatorio: ${ev.title} comienza en ${alarmMinutesBefore} minutos`,
      'END:VALARM',
      'END:VEVENT'
    );
  });

  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
}

/**
 * Enlace directo para añadir un evento específico a Google Calendar en 1 clic desde el celular
 */
export function generateGoogleCalendarUrl(ev: ScheduleEvent): string {
  const now = new Date();
  const dayOffset = (getDayOffset(ev.dayOfWeek) - now.getDay() + 7) % 7;
  const eventDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);

  const [startH, startM] = ev.startTime.split(':').map(Number);
  const [endH, endM] = ev.endTime.split(':').map(Number);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const fmt = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

  const start = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), startH, startM);
  const end = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), endH, endM);

  const title = encodeURIComponent(`[${ev.type === 'university' ? 'Universidad' : 'Trabajo'}] ${ev.title}`);
  const details = encodeURIComponent(
    `Recordatorio programado 1 hora antes.\n${ev.teacher ? `Profesor/Encargado: ${ev.teacher}\n` : ''}${ev.notes ? `Detalles: ${ev.notes}` : ''}`
  );
  const location = encodeURIComponent(ev.location || '');

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}&location=${location}&recur=RRULE:FREQ=WEEKLY`;
}

