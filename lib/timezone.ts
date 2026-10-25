export const DEFAULT_TIMEZONE = 'America/Bogota';

export const TIMEZONES = [
  { value: 'America/Bogota', label: 'Colombia (Bogotá)' },
  { value: 'America/Mexico_City', label: 'México (CDMX)' },
  { value: 'America/Lima', label: 'Perú (Lima)' },
  { value: 'America/Guayaquil', label: 'Ecuador (Guayaquil)' },
  { value: 'America/Caracas', label: 'Venezuela (Caracas)' },
  { value: 'America/Panama', label: 'Panamá' },
  { value: 'America/Guatemala', label: 'Centroamérica (Guatemala)' },
  { value: 'America/Santo_Domingo', label: 'República Dominicana' },
  { value: 'America/La_Paz', label: 'Bolivia (La Paz)' },
  { value: 'America/Asuncion', label: 'Paraguay (Asunción)' },
  { value: 'America/Santiago', label: 'Chile (Santiago)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (Buenos Aires)' },
  { value: 'America/Montevideo', label: 'Uruguay (Montevideo)' },
  { value: 'America/Sao_Paulo', label: 'Brasil (São Paulo)' },
  { value: 'America/New_York', label: 'EE.UU. Este (Nueva York)' },
  { value: 'America/Los_Angeles', label: 'EE.UU. Pacífico (Los Ángeles)' },
  { value: 'Europe/Madrid', label: 'España (Madrid)' },
  { value: 'UTC', label: 'UTC' },
] as const;

/** Devuelve la zona horaria si es válida para Intl; si no, la zona por defecto. */
export function safeTimezone(tz?: string | null): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Zona horaria detectada en el navegador o el servidor */
export function detectTimezone(): string {
  try {
    return safeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export interface ZonedNow {
  /** 0 = lunes … 6 = domingo */
  dayIndex: number;
  /** Minutos desde la medianoche en la zona indicada */
  minutes: number;
  /** Fecha local en formato YYYY-MM-DD */
  dateISO: string;
}

/** Fecha y hora "de pared" en una zona horaria concreta (funciona igual en servidor y cliente). */
export function getZonedNow(timezone: string, date: Date = new Date()): ZonedNow {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimezone(timezone),
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const hour = parseInt(get('hour'), 10) % 24;
  const minute = parseInt(get('minute'), 10);

  return {
    dayIndex: WEEKDAY_INDEX[get('weekday')] ?? 0,
    minutes: hour * 60 + minute,
    dateISO: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

/** Suma días a una fecha YYYY-MM-DD sin depender de la zona horaria del proceso. */
export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1, d + days));
  return result.toISOString().slice(0, 10);
}
