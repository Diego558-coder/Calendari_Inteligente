'use client';

/**
 * Utilidades del navegador para notificaciones: detección de soporte, service worker y suscripción push.
 */

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: 'insecure' | 'unsupported' | 'ios-install' | 'ios-old' };

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Los iPad modernos se identifican como Mac con pantalla táctil
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

/** true si la app está abierta como app instalada (pantalla de inicio) y no como pestaña del navegador */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' };
  if (!window.isSecureContext) return { ok: false, reason: 'insecure' };

  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS()) {
    // En iPhone las notificaciones web solo existen en apps añadidas a la pantalla de inicio (iOS 16.4+)
    if (!isStandalone()) return { ok: false, reason: 'ios-install' };
    if (!hasApis) return { ok: false, reason: 'ios-old' };
  }
  if (!hasApis) return { ok: false, reason: 'unsupported' };
  return { ok: true };
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** Registra (si hace falta) y espera el service worker activo */
export async function getRegistration(timeoutMs = 10_000): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) throw new Error('Este navegador no soporta service workers');
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('El service worker no respondió a tiempo')), timeoutMs)),
  ]);
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function sameServerKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true; // algunos navegadores no la exponen; asumimos que coincide
  const a = new Uint8Array(current);
  const b = urlBase64ToUint8Array(publicKey);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!getPushSupport().ok) return null;
  try {
    const registration = await getRegistration(5000);
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Crea (o reutiliza) la suscripción push de este dispositivo con la clave del servidor */
export async function subscribePush(publicKey: string): Promise<PushSubscription> {
  const registration = await getRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameServerKey(subscription, publicKey)) {
    // El servidor cambió de claves: la suscripción vieja ya no sirve
    await subscription.unsubscribe().catch(() => {});
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }
  return subscription;
}

/**
 * Muestra una notificación desde la propia página. En Android `new Notification()` no existe:
 * hay que hacerlo a través del service worker.
 */
export async function showLocalNotification(title: string, options: NotificationOptions & { url?: string } = {}): Promise<void> {
  const { url, ...rest } = options;
  const finalOptions: NotificationOptions = {
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    ...rest,
    data: { url: url || '/' },
  };
  try {
    const registration = await getRegistration(5000);
    await registration.showNotification(title, finalOptions);
  } catch {
    new Notification(title, finalOptions);
  }
}

/** Nombre corto del dispositivo para mostrarlo en la lista de equipos con avisos */
export function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Dispositivo';
  const ua = navigator.userAgent;
  const os = isIOS() ? (/iPhone/.test(ua) ? 'iPhone' : 'iPad')
    : /Android/i.test(ua) ? 'Android'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac/i.test(ua) ? 'Mac'
    : /Linux/i.test(ua) ? 'Linux'
    : 'Dispositivo';
  const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return browser ? `${os} · ${browser}` : os;
}
