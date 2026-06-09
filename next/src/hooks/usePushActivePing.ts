'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { getPushSupport, isPushSubscribed } from '@/lib/push/client';

const PING_MS = 25_000;

/** Пока вкладка видима — помечаем push-подписку активной, чтобы сервер не слал уведомления. */
export function usePushActivePing(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const support = getPushSupport();
    if (!support.supported) return;

    let cancelled = false;

    const ping = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const subscribed = await isPushSubscribed();
        if (!subscribed) return;
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        const endpoint = subscription?.endpoint;
        if (!endpoint) return;
        await api('/api/push/active', {
          method: 'POST',
          body: JSON.stringify({ endpoint }),
        });
      } catch {
        /* ignore */
      }
    };

    ping();
    const intervalId = window.setInterval(ping, PING_MS);
    document.addEventListener('visibilitychange', ping);
    window.addEventListener('focus', ping);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', ping);
      window.removeEventListener('focus', ping);
    };
  }, [enabled]);
}
