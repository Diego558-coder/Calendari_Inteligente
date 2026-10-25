'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deviceLabel,
  getExistingSubscription,
  getPushSupport,
  notificationPermission,
  PushSupport,
  showLocalNotification,
  subscribePush,
} from '@/lib/push-client';
import type { CloudSync } from './useCloudSync';

interface ServerPushConfig {
  publicKey: string | null;
  /** El servidor puede avisar con la app cerrada (tiene base de datos) */
  scheduled: boolean;
}

export type PushState =
  | 'loading'
  | 'unsupported'   // navegador sin soporte / iPhone sin instalar / http
  | 'denied'        // el usuario bloqueó las notificaciones
  | 'off'           // disponible pero sin activar
  | 'local'         // solo avisos con la app abierta (el servidor no puede programar)
  | 'on';           // push programado activo en este dispositivo

async function postJson(url: string, body: unknown, method = 'POST') {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.error || 'Error de conexión');
  return data;
}

export function usePushNotifications(cloud: CloudSync) {
  const [support, setSupport] = useState<PushSupport>({ ok: false, reason: 'unsupported' });
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [config, setConfig] = useState<ServerPushConfig | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const registeredRef = useRef<string | null>(null);

  // Estado inicial: soporte del navegador, permiso, configuración del servidor y suscripción existente
  useEffect(() => {
    setSupport(getPushSupport());
    setPermission(notificationPermission());
    (async () => {
      try {
        const response = await fetch('/api/push/config');
        setConfig(await response.json());
      } catch {
        setConfig({ publicKey: null, scheduled: false });
      }
      setSubscription(await getExistingSubscription());
      setChecked(true);
    })();
  }, []);

  /** Asocia la suscripción al horario del servidor (necesita credenciales "live") */
  const registerWithServer = useCallback(async (sub: PushSubscription) => {
    let creds = cloud.credentials;
    if (creds.mode !== 'live' || !creds.profileId || !creds.writeKey) {
      creds = (await cloud.syncNow()) || {};
    }
    if (creds.mode !== 'live' || !creds.profileId || !creds.writeKey) {
      throw new Error('No se pudo guardar tu horario en el servidor. Revisa tu conexión e intenta de nuevo.');
    }
    await postJson('/api/push/subscribe', {
      profileId: creds.profileId,
      writeKey: creds.writeKey,
      subscription: sub.toJSON(),
      device: deviceLabel(),
    });
    registeredRef.current = `${creds.profileId}|${sub.endpoint}`;
  }, [cloud]);

  // Al abrir la app, volver a registrar la suscripción por si el servidor la perdió (o se vinculó otro horario)
  useEffect(() => {
    if (!subscription || !config?.scheduled || cloud.mode !== 'live' || !cloud.credentials.profileId) return;
    if (registeredRef.current === `${cloud.credentials.profileId}|${subscription.endpoint}`) return;
    registerWithServer(subscription).catch(() => {});
  }, [subscription, config, cloud.mode, cloud.credentials.profileId, registerWithServer]);

  const enable = useCallback(async () => {
    setMessage(null);
    const currentSupport = getPushSupport();
    setSupport(currentSupport);
    if (!currentSupport.ok) return;

    // Pedir el permiso PRIMERO, directamente en el clic (iPhone lo exige)
    let result: NotificationPermission;
    try {
      result = await Notification.requestPermission();
    } catch {
      result = Notification.permission;
    }
    setPermission(result);
    if (result !== 'granted') {
      setMessage({ type: 'error', text: result === 'denied' ? 'Bloqueaste las notificaciones. Actívalas en los ajustes del navegador o del teléfono para esta app.' : 'Necesitamos tu permiso para avisarte.' });
      return;
    }

    setBusy(true);
    try {
      if (!config?.publicKey) {
        await showLocalNotification('🔔 ¡Notificaciones activadas!', { body: 'Te avisaremos mientras la app esté abierta.', tag: 'mh-test' });
        setMessage({ type: 'info', text: 'Activadas en modo básico: avisan mientras la app esté abierta. Para avisos con la app cerrada, conecta la base de datos gratuita (ver README).' });
        return;
      }

      const sub = await subscribePush(config.publicKey);
      setSubscription(sub);

      if (config.scheduled) {
        await registerWithServer(sub);
      }
      await postJson('/api/push/test', { subscription: sub.toJSON() });
      setMessage({
        type: 'ok',
        text: config.scheduled
          ? '¡Listo! Te llegó una notificación de prueba. Desde ahora te avisaremos aunque la app esté cerrada.'
          : '¡Listo! Te llegó una notificación de prueba.',
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'No se pudieron activar las notificaciones.' });
    } finally {
      setBusy(false);
    }
  }, [config, registerWithServer]);

  const disable = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const sub = subscription || (await getExistingSubscription());
      if (sub) {
        const creds = cloud.credentials;
        if (creds.mode === 'live' && creds.profileId && creds.writeKey) {
          await postJson('/api/push/subscribe', { profileId: creds.profileId, writeKey: creds.writeKey, endpoint: sub.endpoint }, 'DELETE').catch(() => {});
        }
        await sub.unsubscribe().catch(() => {});
      }
      registeredRef.current = null;
      setSubscription(null);
      setMessage({ type: 'info', text: 'Notificaciones desactivadas en este dispositivo.' });
    } finally {
      setBusy(false);
    }
  }, [subscription, cloud.credentials]);

  const sendTest = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (subscription) {
        await postJson('/api/push/test', { subscription: subscription.toJSON() });
      } else {
        await showLocalNotification('🔔 Notificación de prueba', { body: 'Así te avisará MiHorario antes de cada actividad.', tag: 'mh-test' });
      }
      setMessage({ type: 'ok', text: 'Prueba enviada. Debería aparecer en unos segundos.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'No se pudo enviar la prueba.' });
    } finally {
      setBusy(false);
    }
  }, [subscription]);

  let state: PushState;
  if (!checked) state = 'loading';
  else if (!support.ok) state = 'unsupported';
  else if (permission === 'denied') state = 'denied';
  else if (permission === 'granted' && subscription && config?.scheduled) state = 'on';
  else if (permission === 'granted' && (!config?.publicKey || subscription)) state = 'local';
  else state = 'off';

  return { state, support, permission, config, subscription, busy, message, enable, disable, sendTest };
}

export type PushNotifications = ReturnType<typeof usePushNotifications>;
