import webpush from 'web-push';
import { EventType, ScheduleEvent } from '@/types/schedule';
import { DAYS_OF_WEEK, timeToMinutes } from './schedule-utils';
import { addDaysISO, getZonedNow } from './timezone';
import { isKvConfigured, kv } from './kv';
import { getProfile, Profile, profileKey, PUSH_INDEX_KEY, saveProfile, StoredPushSubscription } from './profile';

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

const VAPID_STORAGE_KEY = 'push:vapid';
let cachedVapid: VapidKeys | null = null;

/**
 * Claves VAPID para firmar las notificaciones. Si no están en variables de entorno,
 * se generan una sola vez y se guardan en la base de datos: no hay que configurar nada.
 */
export async function getVapidKeys(): Promise<VapidKeys | null> {
  if (cachedVapid) return cachedVapid;

  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (publicKey && privateKey) {
    cachedVapid = { publicKey, privateKey };
    return cachedVapid;
  }

  if (!isKvConfigured()) return null;

  let stored = await kv.get<VapidKeys>(VAPID_STORAGE_KEY);
  if (!stored?.publicKey || !stored?.privateKey) {
    await kv.set(VAPID_STORAGE_KEY, webpush.generateVAPIDKeys(), { nx: true });
    // Releer por si otra instancia las generó al mismo tiempo
    stored = await kv.get<VapidKeys>(VAPID_STORAGE_KEY);
  }
  cachedVapid = stored;
  return cachedVapid;
}

function vapidSubject(): string {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  // Apple exige un "subject" https o mailto válido
  return host ? `https://${host}` : 'mailto:mihorario-ia@example.com';
}

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  /** Mantener visible hasta que el usuario la toque (Android/escritorio) */
  requireInteraction?: boolean;
}

export type SendResult = { ok: true } | { ok: false; gone: boolean; status?: number; error: string };

export function isValidSubscription(sub: any): sub is StoredPushSubscription {
  return Boolean(
    sub &&
      typeof sub.endpoint === 'string' &&
      /^https:\/\//.test(sub.endpoint) &&
      sub.endpoint.length < 1000 &&
      typeof sub.keys?.p256dh === 'string' &&
      typeof sub.keys?.auth === 'string'
  );
}

export async function sendPush(subscription: Pick<StoredPushSubscription, 'endpoint' | 'keys'>, payload: PushPayload): Promise<SendResult> {
  const vapid = await getVapidKeys();
  if (!vapid) return { ok: false, gone: false, error: 'Notificaciones no configuradas en el servidor' };

  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
      {
        vapidDetails: { subject: vapidSubject(), publicKey: vapid.publicKey, privateKey: vapid.privateKey },
        TTL: 60 * 60,
        urgency: 'high',
      }
    );
    return { ok: true };
  } catch (err: any) {
    const status: number | undefined = err?.statusCode;
    // 404/410: la suscripción ya no existe. 401/403: se creó con otras claves VAPID. En ambos casos sobra.
    const gone = status === 404 || status === 410 || status === 401 || status === 403;
    return { ok: false, gone, status, error: err?.body || err?.message || 'Error enviando notificación' };
  }
}

// ---------------------------------------------------------------------------
// Recordatorios programados
// ---------------------------------------------------------------------------

const TYPE_TEXT: Record<EventType, { emoji: string; label: string }> = {
  university: { emoji: '🎓', label: 'Clase' },
  work: { emoji: '💼', label: 'Turno de trabajo' },
  personal: { emoji: '📌', label: 'Actividad' },
};

export function formatMinutesUntil(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hoursText = `${hours} hora${hours === 1 ? '' : 's'}`;
  return rest ? `${hoursText} y ${rest} min` : hoursText;
}

export interface DueReminder {
  event: ScheduleEvent;
  /** Fecha local (YYYY-MM-DD) de la ocurrencia */
  date: string;
  minutesUntil: number;
}

/**
 * Actividades que empiezan dentro de la anticipación configurada (por ejemplo, en la próxima hora).
 * Revisa hoy y mañana para cubrir clases de madrugada cuyo aviso cae el día anterior.
 * Cualquier momento entre la hora del aviso y el inicio cuenta, así un cron con retraso igual avisa.
 */
export function dueReminders(profile: Pick<Profile, 'events' | 'timezone' | 'alarmMinutes'>, now: Date = new Date()): DueReminder[] {
  const lead = profile.alarmMinutes;
  if (!lead || lead <= 0) return [];

  const zoned = getZonedNow(profile.timezone, now);
  const due: DueReminder[] = [];

  for (const dayOffset of [0, 1]) {
    const dayKey = DAYS_OF_WEEK[(zoned.dayIndex + dayOffset) % 7].key;
    for (const event of profile.events) {
      if (event.dayOfWeek !== dayKey) continue;
      const minutesUntil = dayOffset * 1440 + timeToMinutes(event.startTime) - zoned.minutes;
      if (minutesUntil > 0 && minutesUntil <= lead) {
        due.push({ event, date: addDaysISO(zoned.dateISO, dayOffset), minutesUntil });
      }
    }
  }
  return due;
}

export function reminderPayload(reminder: DueReminder): PushPayload {
  const { event, minutesUntil, date } = reminder;
  const info = TYPE_TEXT[event.type] || TYPE_TEXT.personal;
  return {
    title: `${info.emoji} ${event.title} en ${formatMinutesUntil(minutesUntil)}`,
    body: `${info.label} de ${event.startTime} a ${event.endTime}${event.location ? ` · ${event.location}` : ''}`,
    tag: `mh-${event.id}-${date}`,
    url: '/?tab=agenda',
    requireInteraction: true,
  };
}

export interface CronStats {
  profiles: number;
  sent: number;
  failed: number;
  removedSubscriptions: number;
}

/** Recorre los perfiles con notificaciones activas y envía los recordatorios que tocan ahora */
export async function runReminderCron(now: Date = new Date()): Promise<CronStats> {
  const stats: CronStats = { profiles: 0, sent: 0, failed: 0, removedSubscriptions: 0 };
  if (!isKvConfigured() || !(await getVapidKeys())) return stats;

  const ids = await kv.smembers(PUSH_INDEX_KEY);
  stats.profiles = ids.length;

  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25);
    const profiles = await kv.mget<Profile>(chunk.map(profileKey));

    await Promise.all(
      profiles.map(async (profile, index) => {
        if (!profile || !profile.push?.length) {
          await kv.srem(PUSH_INDEX_KEY, chunk[index]);
          return;
        }

        const goneEndpoints = new Set<string>();
        for (const reminder of dueReminders(profile, now)) {
          // SET NX: si otra ejecución ya lo envió, no se repite
          const sentKey = `push:sent:${profile.id}:${reminder.event.id}:${reminder.date}:${reminder.event.startTime}`;
          const claimed = await kv.set(sentKey, 1, { ex: 2 * 24 * 60 * 60, nx: true });
          if (!claimed) continue;

          const payload = reminderPayload(reminder);
          const targets = profile.push.filter((sub) => !goneEndpoints.has(sub.endpoint));
          const results = await Promise.all(targets.map((sub) => sendPush(sub, payload)));
          results.forEach((result, subIndex) => {
            if (result.ok) {
              stats.sent++;
              return;
            }
            stats.failed++;
            if (result.gone) goneEndpoints.add(targets[subIndex].endpoint);
          });
        }

        if (goneEndpoints.size > 0) {
          stats.removedSubscriptions += goneEndpoints.size;
          // Releer antes de guardar para no pisar cambios de horario hechos mientras tanto
          const fresh = await getProfile(profile.id);
          if (fresh) {
            fresh.push = fresh.push.filter((sub) => !goneEndpoints.has(sub.endpoint));
            await saveProfile(fresh);
          }
        }
      })
    );
  }

  return stats;
}
