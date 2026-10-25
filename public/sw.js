/* Service worker de MiHorario IA: funcionamiento sin conexión + notificaciones push. */
const CACHE_VERSION = 'mihorario-v3';
const APP_SHELL = ['/', '/manifest.json', '/icon.svg', '/icons/icon-192.png', '/icons/badge-96.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // Borra cachés viejos, incluidos los de la versión anterior basada en next-pwa/workbox
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// En desarrollo (localhost) no se usa caché: los archivos cambian en cada edición
const IS_DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (IS_DEV || request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // La API siempre va a la red (IA, sincronización, feed de calendario)
  if (url.pathname.startsWith('/api/')) return;

  // Recursos con hash en el nombre: nunca cambian, se sirven desde caché
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Páginas: primero la red (para tener siempre la última versión) y si no hay conexión, la copia guardada
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error()))
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'MiHorario IA', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'MiHorario IA';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: data.tag || 'mihorario',
    renotify: true,
    requireInteraction: Boolean(data.requireInteraction),
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          if ('navigate' in client) client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
