export const TIMEZONES = [
  { value: 'America/Bogota', label: 'Colombia (Bogotá)' },
  { value: 'America/Mexico_City', label: 'México (CDMX)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (Buenos Aires)' },
  { value: 'America/Santiago', label: 'Chile (Santiago)' },
  { value: 'Europe/Madrid', label: 'España (Madrid)' },
  { value: 'America/New_York', label: 'EE.UU. (Nueva York)' },
  { value: 'UTC', label: 'UTC' },
] as const;

export type TimezoneValue = typeof TIMEZONES[number]['value'];

export function getUserTimezone(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('userTimezone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
  return 'America/Bogota';
}

export function setUserTimezone(tz: string) {
  if (typeof window !== 'undefined') localStorage.setItem('userTimezone', tz);
}