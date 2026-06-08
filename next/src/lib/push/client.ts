'use client';

import { api } from '@/lib/api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export type PushSupport = {
  supported: boolean;
  reason?: string;
};

export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined') return { supported: false };
  if (!('serviceWorker' in navigator)) {
    return { supported: false, reason: 'Service Worker не поддерживается' };
  }
  if (!('PushManager' in window)) {
    return { supported: false, reason: 'Push API не поддерживается' };
  }
  if (!window.isSecureContext) {
    return { supported: false, reason: 'Нужен HTTPS' };
  }
  return { supported: true };
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  const support = getPushSupport();
  if (!support.supported) return null;

  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

export async function subscribeToPush(): Promise<{ ok: boolean; message?: string }> {
  const support = getPushSupport();
  if (!support.supported) {
    return { ok: false, message: support.reason ?? 'Уведомления недоступны' };
  }

  const config = await api<{ enabled: boolean; publicKey: string | null }>('/api/push/subscribe', {
    allowUnauthorized: false,
  });

  if (!config.enabled || !config.publicKey) {
    return {
      ok: false,
      message: 'Push не настроен на сервере (VAPID ключи)',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, message: 'Разрешение на уведомления не выдано' };
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    return { ok: false, message: 'Не удалось зарегистрировать Service Worker' };
  }

  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, message: 'Некорректная подписка браузера' };
  }

  await api('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });

  return { ok: true };
}

export async function unsubscribeFromPush(): Promise<void> {
  const support = getPushSupport();
  if (!support.supported) return;

  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => {});
  await api('/api/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
}

export async function isPushSubscribed(): Promise<boolean> {
  const support = getPushSupport();
  if (!support.supported) return false;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  return Boolean(subscription);
}
