import { DayOfWeek, EventType, FreeTimeSlot, ScheduleConflict, ScheduleEvent, ScheduleStats } from '@/types/schedule';
import { addDaysISO, getZonedNow, safeTimezone } from './timezone';

export const DAYS_OF_WEEK: { key: DayOfWeek; label: string; short: string }[] = [
  { key: 'lunes', label: 'Lunes', short: 'Lun' },
  { key: 'martes', label: 'Martes', short: 'Mar' },
  { key: 'miercoles', label: 'Miércoles', short: 'Mié' },
  { key: 'jueves', label: 'Jueves', short: 'Jue' },
  { key: 'viernes', label: 'Viernes', short: 'Vie' },
  { key: 'sabado', label: 'Sábado', short: 'Sáb' },
  { key: 'domingo', label: 'Domingo', short: 'Dom' },
];

const EVENT_TYPES: EventType[] = ['university', 'work', 'personal'];

/**
 * Genera un ID único. `crypto.randomUUID` no existe fuera de contextos seguros
 * (por ejemplo al abrir la app por http://192.168.x.x desde el celular), así que hay respaldo.
 */
export function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Contexto no seguro: usar el respaldo
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 0 = lunes … 6 = domingo */
export function dayIndexOf(day: DayOfWeek): number {
  return DAYS_OF_WEEK.findIndex((d) => d.key === day);
}

/**
 * Interpreta cualquier variante de texto de un día ("Miércoles", "mie", "X", "Wednesday"…).
 * Devuelve null si no se reconoce.
 */
export function parseDay(rawDay: unknown): DayOfWeek | null {
  const clean = String(rawDay ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');

  if (!clean) return null;

  // Abreviaturas de una letra usadas en horarios impresos (L M X J V S D)
  const singleLetter: Record<string, DayOfWeek> = { l: 'lunes', m: 'martes', x: 'miercoles', j: 'jueves', v: 'viernes', s: 'sabado', d: 'domingo' };
  if (clean.length === 1) return singleLetter[clean] || null;

  if (clean.startsWith('lu') || clean.startsWith('mon')) return 'lunes';
  if (clean.startsWith('mi') || clean.startsWith('wed')) return 'miercoles';
  if (clean.startsWith('ma') || clean.startsWith('tue')) return 'martes';
  if (clean.startsWith('ju') || clean.startsWith('thu')) return 'jueves';
  if (clean.startsWith('vi') || clean.startsWith('fri')) return 'viernes';
  if (clean.startsWith('sa') || clean.startsWith('sat')) return 'sabado';
  if (clean.startsWith('do') || clean.startsWith('sun')) return 'domingo';

  return null;
}

/**
 * Normaliza cualquier variante de texto del día al tipo DayOfWeek estándar
 */
export function normalizeDay(rawDay: string): DayOfWeek {
  return parseDay(rawDay) || 'lunes';
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
 * Normaliza horas escritas de muchas formas ("8am", "2 pm", "14:30", "7.30", "7h30", "0730")
 * al formato 24h "HH:mm". Devuelve null si no se puede interpretar.
 */
export function normalizeTime(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let text = String(raw).trim().toLowerCase();
  if (!text) return null;

  let meridiem: 'am' | 'pm' | null = null;
  if (/p\.?\s*m\.?|de la tarde|de la noche/.test(text)) meridiem = 'pm';
  else if (/a\.?\s*m\.?|de la ma[nñ]ana|de la madrugada/.test(text)) meridiem = 'am';
  text = text
    .replace(/p\.?\s*m\.?|a\.?\s*m\.?|de la (tarde|noche|ma[nñ]ana|madrugada)|hrs?|horas?/g, '')
    .trim();

  let hours: number;
  let minutes = 0;
  const separated = text.match(/^(\d{1,2})\s*[:h.,]\s*(\d{1,2})$/);
  const compact = text.match(/^(\d{3,4})$/);
  const hourOnly = text.match(/^(\d{1,2})$/);

  if (separated) {
    hours = parseInt(separated[1], 10);
    minutes = parseInt(separated[2].padEnd(2, '0'), 10);
  } else if (compact) {
    const digits = compact[1].padStart(4, '0');
    hours = parseInt(digits.slice(0, 2), 10);
    minutes = parseInt(digits.slice(2), 10);
  } else if (hourOnly) {
    hours = parseInt(hourOnly[1], 10);
  } else {
    return null;
  }

  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours === 24 && minutes === 0) return '23:59';
  if (hours > 23 || minutes > 59) return null;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return undefined;
  return text.slice(0, maxLength);
}

/**
 * Valida y limpia un evento que viene de la IA, de un archivo importado o del servidor.
 * Devuelve null si le faltan datos esenciales (título, día u hora de inicio).
 */
export function sanitizeEvent(raw: any, fallbackType: EventType = 'personal'): ScheduleEvent | null {
  if (!raw || typeof raw !== 'object') return null;

  const title = cleanText(raw.title, 120);
  const dayOfWeek = parseDay(raw.dayOfWeek);
  const startTime = normalizeTime(raw.startTime);
  if (!title || !dayOfWeek || !startTime) return null;

  let endTime = normalizeTime(raw.endTime);
  let notes = cleanText(raw.notes, 500);

  if (!endTime) {
    endTime = minutesToTime(timeToMinutes(startTime) + 60);
  } else if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    // Turno nocturno que cruza la medianoche: se muestra hasta las 23:59 y se deja nota
    const realEnd = endTime;
    endTime = '23:59';
    notes = [notes, `Termina a las ${realEnd} del día siguiente`].filter(Boolean).join(' · ');
  }

  const type: EventType = EVENT_TYPES.includes(raw.type) ? raw.type : fallbackType;
  const id = typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 64 ? raw.id : makeId();

  return {
    id,
    title,
    type,
    dayOfWeek,
    startTime,
    endTime,
    location: cleanText(raw.location, 120),
    teacher: cleanText(raw.teacher, 120),
    notes,
    ...(typeof raw.color === 'string' ? { color: raw.color.slice(0, 32) } : {}),
  };
}

/** Limpia una lista completa, descartando elementos inválidos y IDs repetidos. */
export function sanitizeEvents(list: unknown, fallbackType: EventType = 'personal', maxItems = 300): ScheduleEvent[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const result: ScheduleEvent[] = [];
  for (const item of list.slice(0, maxItems)) {
    const ev = sanitizeEvent(item, fallbackType);
    if (!ev) continue;
    if (seen.has(ev.id)) ev.id = makeId();
    seen.add(ev.id);
    result.push(ev);
  }
  return result;
}

/** true si dos eventos representan la misma actividad (mismo título, día y hora) */
export function isSameActivity(a: Pick<ScheduleEvent, 'title' | 'dayOfWeek' | 'startTime'>, b: Pick<ScheduleEvent, 'title' | 'dayOfWeek' | 'startTime'>): boolean {
  return a.dayOfWeek === b.dayOfWeek && a.startTime === b.startTime && a.title.trim().toLowerCase() === b.title.trim().toLowerCase();
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
    byDay[ev.dayOfWeek]?.push(ev);
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

export interface EventLane {
  /** Columna asignada dentro del grupo de eventos que se cruzan (0 = primera) */
  column: number;
  /** Número de columnas del grupo */
  columns: number;
}

/**
 * Reparte en columnas los eventos de un mismo día que se superponen (como Google Calendar),
 * para que ninguno quede tapado detrás de otro.
 */
export function layoutOverlaps(dayEvents: ScheduleEvent[]): Map<string, EventLane> {
  const lanes = new Map<string, EventLane>();
  const sorted = [...dayEvents].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime) || timeToMinutes(b.endTime) - timeToMinutes(a.endTime)
  );

  let group: ScheduleEvent[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -1;

  const closeGroup = () => {
    group.forEach((ev) => {
      const lane = lanes.get(ev.id)!;
      lanes.set(ev.id, { column: lane.column, columns: columnEnds.length });
    });
    group = [];
    columnEnds = [];
    groupEnd = -1;
  };

  for (const ev of sorted) {
    const start = timeToMinutes(ev.startTime);
    // Duración mínima visual de 30 min, igual que en la cuadrícula
    const end = Math.max(timeToMinutes(ev.endTime), start + 30);
    if (group.length > 0 && start >= groupEnd) closeGroup();

    let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }
    lanes.set(ev.id, { column, columns: 1 });
    group.push(ev);
    groupEnd = Math.max(groupEnd, end);
  }
  if (group.length > 0) closeGroup();

  return lanes;
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

  events.forEach((ev) => byDay[ev.dayOfWeek]?.push(ev));

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

const ICS_DAY_CODES: Record<DayOfWeek, string> = {
  lunes: 'MO',
  martes: 'TU',
  miercoles: 'WE',
  jueves: 'TH',
  viernes: 'FR',
  sabado: 'SA',
  domingo: 'SU',
};

const TYPE_EMOJI: Record<EventType, string> = { university: '🎓', work: '💼', personal: '📌' };
const TYPE_LABEL: Record<EventType, string> = { university: 'Universidad', work: 'Trabajo', personal: 'Personal' };

/** Escapa texto según RFC 5545 */
function escapeICS(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

/** Divide líneas de más de 75 octetos como exige RFC 5545 (Apple y Google son estrictos con esto) */
function foldICSLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of Array.from(line)) {
    const charBytes = encoder.encode(char).length;
    const limit = chunks.length === 0 ? 75 : 74; // las líneas de continuación empiezan con un espacio
    if (currentBytes + charBytes > limit) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current) chunks.push(current);
  return chunks.join('\r\n ');
}

export interface ICSOptions {
  alarmMinutes?: number;
  timezone?: string;
  calendarName?: string;
  now?: Date;
}

/**
 * Genera el archivo universal .ics (iCalendar) con eventos semanales recurrentes y alarma
 * (TRIGGER:-PT60M por defecto). Compatible con Apple Calendar, Google Calendar y Outlook.
 * Las horas son "flotantes" (hora local del dispositivo), lo correcto para un horario de clases.
 */
export function generateICS(events: ScheduleEvent[], options: ICSOptions = {}): string {
  const { alarmMinutes = 60, calendarName = 'MiHorario IA', now = new Date() } = options;
  const timezone = safeTimezone(options.timezone);

  // Lunes de la semana actual en la zona del usuario: así también aparecen los eventos de esta semana
  const today = getZonedNow(timezone, now);
  const mondayISO = addDaysISO(today.dateISO, -today.dayIndex);
  const dtStamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MiHorario IA//Calendario Dinamico//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(calendarName)}`,
    `X-WR-TIMEZONE:${timezone}`,
    'X-WR-CALDESC:Clases\\, turnos de trabajo y actividades sincronizadas desde MiHorario IA',
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-APPLE-CALENDAR-COLOR:#6366f1',
  ];

  events.forEach((ev) => {
    const dateISO = addDaysISO(mondayISO, dayIndexOf(ev.dayOfWeek)).replace(/-/g, '');
    const start = `${dateISO}T${ev.startTime.replace(':', '')}00`;
    const end = `${dateISO}T${ev.endTime.replace(':', '')}00`;
    const typeLabel = TYPE_LABEL[ev.type] || 'Actividad';

    const descriptionParts = [
      `${typeLabel}: ${ev.title}`,
      ev.teacher ? `Profesor/Encargado: ${ev.teacher}` : '',
      ev.notes ? `Notas: ${ev.notes}` : '',
    ].filter(Boolean);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.id}@mihorario-ia`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAY_CODES[ev.dayOfWeek]}`,
      `SUMMARY:${escapeICS(`${TYPE_EMOJI[ev.type] || '📌'} ${ev.title}`)}`,
      `DESCRIPTION:${escapeICS(descriptionParts.join('\n'))}`,
      ...(ev.location ? [`LOCATION:${escapeICS(ev.location)}`] : []),
      `CATEGORIES:${typeLabel}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
    );

    if (alarmMinutes > 0) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `TRIGGER;RELATED=START:-PT${alarmMinutes}M`,
        `DESCRIPTION:${escapeICS(`${ev.title} comienza en ${formatLeadTime(alarmMinutes)}`)}`,
        'END:VALARM',
      );
    }

    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.map(foldICSLine).join('\r\n') + '\r\n';
}

/** "1 hora", "30 minutos", "2 horas" */
export function formatLeadTime(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hora${hours === 1 ? '' : 's'}`;
  }
  return `${minutes} minuto${minutes === 1 ? '' : 's'}`;
}

/**
 * Enlace directo para añadir un evento específico a Google Calendar en 1 clic desde el celular
 */
export function generateGoogleCalendarUrl(ev: ScheduleEvent, timezone?: string): string {
  const tz = safeTimezone(timezone);
  const today = getZonedNow(tz);
  const offset = (dayIndexOf(ev.dayOfWeek) - today.dayIndex + 7) % 7;
  const dateISO = addDaysISO(today.dateISO, offset).replace(/-/g, '');

  const start = `${dateISO}T${ev.startTime.replace(':', '')}00`;
  const end = `${dateISO}T${ev.endTime.replace(':', '')}00`;

  const title = encodeURIComponent(`${TYPE_EMOJI[ev.type] || '📌'} ${ev.title}`);
  const details = encodeURIComponent(
    [
      `${TYPE_LABEL[ev.type] || 'Actividad'} · creado con MiHorario IA`,
      ev.teacher ? `Profesor/Encargado: ${ev.teacher}` : '',
      ev.notes ? `Detalles: ${ev.notes}` : '',
    ].filter(Boolean).join('\n')
  );
  const location = encodeURIComponent(ev.location || '');

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&ctz=${encodeURIComponent(tz)}&details=${details}&location=${location}&recur=RRULE:FREQ%3DWEEKLY`;
}
