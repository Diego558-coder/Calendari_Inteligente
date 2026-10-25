import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { EventType, ScheduleEvent } from '@/types/schedule';
import { DAYS_OF_WEEK, sanitizeEvents } from './schedule-utils';
import { safeTimezone } from './timezone';
import { kv } from './kv';

/**
 * Un "perfil" es el horario de una persona guardado en el servidor. Lo usan:
 *  - el feed .ics al que se suscribe el calendario del celular (solo lectura, con el ID)
 *  - las notificaciones push programadas (el cron recorre los perfiles con suscripciones)
 *  - la vinculación de otros dispositivos (requiere la clave de escritura)
 */
export interface StoredPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
  addedAt: number;
  device?: string;
}

export interface Profile {
  id: string;
  writeKeyHash: string;
  events: ScheduleEvent[];
  timezone: string;
  alarmMinutes: number;
  /** Momento (del cliente) de la última modificación del horario */
  updatedAt: number;
  createdAt: number;
  feed?: { lastPing: number; client: string };
  push: StoredPushSubscription[];
}

export const PROFILE_TTL_SECONDS = 400 * 24 * 60 * 60; // se renueva con cada cambio
export const PUSH_INDEX_KEY = 'push:profiles';

export const profileKey = (id: string) => `profile:${id}`;

export const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]{16,40}$/;

function hashKey(writeKey: string): string {
  return createHash('sha256').update(writeKey).digest('hex');
}

export function verifyWriteKey(profile: Profile, writeKey: unknown): boolean {
  if (typeof writeKey !== 'string' || !writeKey) return false;
  const a = Buffer.from(hashKey(writeKey));
  const b = Buffer.from(profile.writeKeyHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clampAlarmMinutes(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 60;
  return Math.max(0, Math.min(24 * 60, n));
}

export async function getProfile(id: unknown): Promise<Profile | null> {
  if (typeof id !== 'string' || !PROFILE_ID_PATTERN.test(id)) return null;
  const profile = await kv.get<Profile>(profileKey(id));
  if (profile) profile.push ||= [];
  return profile;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await kv.set(profileKey(profile.id), profile, { ex: PROFILE_TTL_SECONDS });
  if (profile.push.length > 0) await kv.sadd(PUSH_INDEX_KEY, profile.id);
  else await kv.srem(PUSH_INDEX_KEY, profile.id);
}

export async function createProfile(data: { events: ScheduleEvent[]; timezone: string; alarmMinutes: number; updatedAt?: number }): Promise<{ profile: Profile; writeKey: string }> {
  const writeKey = randomBytes(24).toString('base64url');
  const now = Date.now();
  const profile: Profile = {
    id: randomBytes(16).toString('base64url'),
    writeKeyHash: hashKey(writeKey),
    events: data.events,
    timezone: data.timezone,
    alarmMinutes: data.alarmMinutes,
    updatedAt: data.updatedAt || now,
    createdAt: now,
    push: [],
  };
  await saveProfile(profile);
  return { profile, writeKey };
}

/** Datos públicos del horario que se devuelven al cliente */
export function publicProfileData(profile: Profile) {
  return {
    events: profile.events,
    timezone: profile.timezone,
    alarmMinutes: profile.alarmMinutes,
    updatedAt: profile.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Modo sin base de datos: el horario viaja comprimido dentro del propio enlace
// ---------------------------------------------------------------------------

const TYPE_CODES: Record<EventType, string> = { university: 'u', work: 'w', personal: 'p' };
const CODE_TYPES: Record<string, EventType> = { u: 'university', w: 'work', p: 'personal' };

export const STATIC_TOKEN_PREFIX = 's_';

export function encodeStaticToken(events: ScheduleEvent[], timezone: string, alarmMinutes: number): string {
  const compact = events.map((e) => [
    e.id.slice(0, 12),
    e.title,
    TYPE_CODES[e.type] || 'p',
    DAYS_OF_WEEK.findIndex((d) => d.key === e.dayOfWeek),
    e.startTime,
    e.endTime,
    e.location || '',
    e.teacher || '',
    e.notes || '',
  ]);
  const json = JSON.stringify({ e: compact, z: timezone, a: alarmMinutes });
  return STATIC_TOKEN_PREFIX + deflateRawSync(Buffer.from(json, 'utf8'), { level: 9 }).toString('base64url');
}

export function decodeStaticToken(token: string): { events: ScheduleEvent[]; timezone: string; alarmMinutes: number } | null {
  if (!token.startsWith(STATIC_TOKEN_PREFIX) || token.length > 12_000) return null;
  try {
    const json = inflateRawSync(Buffer.from(token.slice(STATIC_TOKEN_PREFIX.length), 'base64url'), { maxOutputLength: 400_000 }).toString('utf8');
    const data = JSON.parse(json);
    const rawEvents = (Array.isArray(data.e) ? data.e : []).map((item: any[]) => ({
      id: item[0],
      title: item[1],
      type: CODE_TYPES[item[2]] || 'personal',
      dayOfWeek: DAYS_OF_WEEK[item[3]]?.key,
      startTime: item[4],
      endTime: item[5],
      location: item[6],
      teacher: item[7],
      notes: item[8],
    }));
    return {
      events: sanitizeEvents(rawEvents),
      timezone: safeTimezone(data.z),
      alarmMinutes: clampAlarmMinutes(data.a),
    };
  } catch {
    return null;
  }
}

/** Nombre legible del cliente de calendario que consulta el feed */
export function describeCalendarClient(userAgent: string): string | null {
  if (/dataaccessd|CalendarAgent|iCal|iOS\/|accountsd/i.test(userAgent)) return 'Apple Calendar (iPhone / Mac)';
  if (/Google-Calendar-Importer|Google-Calendar/i.test(userAgent)) return 'Google Calendar';
  if (/Outlook|Microsoft|Exchange/i.test(userAgent)) return 'Outlook';
  if (/Thunderbird|DAVx|ICSx|Samsung/i.test(userAgent)) return 'App de calendario';
  // Un navegador que abre el enlace es una descarga, no una suscripción
  if (/Mozilla|curl|bot/i.test(userAgent)) return null;
  return 'App de calendario';
}
