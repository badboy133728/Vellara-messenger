'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { getPushSupport, isPushSubscribed } from '@/lib/push/client';

const PING_MS = 45_000;

/** Пока вкладка видима — помечаем push-подписку активной, чтобы сервер не слал уведомления. */
export function usePushActivePing(enabled = true) {
  const endpointRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const support = getPushSupport();
    if (!support.supported) return;

    let cancelled = false;

    const resolveEndpoint = async () => {
      if (endpointRef.current) return endpointRef.current;
      const subscribed = await isPushSubscribed();
      if (!subscribed) return null;
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? null;
      if (endpoint) endpointRef.current = endpoint;
      return endpoint;
    };

    const markActive = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const endpoint = await resolveEndpoint();
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
        const endpoint = await resolveEndpoint();
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
      endpointRef.current = null;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', markActive);
      window.removeEventListener('pagehide', markInactive);
    };
  }, [enabled]);
}
