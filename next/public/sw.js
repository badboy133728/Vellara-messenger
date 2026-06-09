/* Vellara Messenger — Web Push service worker v4 */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function normalizeUrl(url) {
  if (!url) return '/main';
  try {
    const parsed = new URL(url, self.location.origin);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url.startsWith('/') ? url : '/main';
  }
}

/** Не показывать OS-уведомление, если сайт открыт на этом устройстве. */
async function shouldSuppressPushNotification() {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  return clients.some((client) => client.visibilityState === 'visible');
}

self.addEventListener('push', (event) => {
  let data = { title: 'Vellara', body: 'Новое сообщение', url: '/main', tag: 'vellara' };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    /* ignore malformed payload */
  }

  const targetPath = normalizeUrl(data.url);

  event.waitUntil(
    (async () => {
      if (await shouldSuppressPushNotification()) return;

      await self.registration.showNotification(data.title || 'Vellara', {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: data.tag || 'vellara-message',
        renotify: true,
        vibrate: [180, 80, 180],
        requireInteraction: false,
        silent: false,
        data: { url: targetPath },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = normalizeUrl(event.notification.data?.url);
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (!client.url.startsWith(self.location.origin)) continue;
        const focused = await client.focus();
        if ('navigate' in focused) {
          try {
            await focused.navigate(targetPath);
            return;
          } catch {
            focused.postMessage({ type: 'notification-open', url: targetPath });
            return;
          }
        }
        focused.postMessage({ type: 'notification-open', url: targetPath });
        return;
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    }),
  );
});
