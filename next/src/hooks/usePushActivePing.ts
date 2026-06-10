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

    const getEndpoint = async () => {
      const subscribed = await isPushSubscribed();
      if (!subscribed) return null;
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      return subscription?.endpoint ?? null;
    };

    const markActive = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const endpoint = await getEndpoint();
        if (!endpoint) return;
        await api('/api/push/active', {
          method: 'POST',
          body: JSON.stringify({ endpoint }),
        });
      } catch {
        /* ignore */
      }
    };

    const markInactive = async () => {
      if (cancelled) return;
      try {
        const endpoint = await getEndpoint();
        if (!endpoint) return;
        await api('/api/push/inactive', {
          method: 'POST',
          body: JSON.stringify({ endpoint }),
        });
      } catch {
        /* ignore */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void markActive();
      } else {
        void markInactive();
      }
    };

    if (document.visibilityState === 'visible') {
      void markActive();
    }
    const intervalId = window.setInterval(markActive, PING_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', markActive);
    window.addEventListener('pagehide', markInactive);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', markActive);
      window.removeEventListener('pagehide', markInactive);
    };
  }, [enabled]);
}
