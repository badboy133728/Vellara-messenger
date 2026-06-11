'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';

/** Периодически обновляет last_seen_at, пока открыт мессенджер. */
export function useLastSeenHeartbeat(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      api('/api/presence', { method: 'POST' }).catch(() => {});
    };

    tick();
    const intervalId = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [enabled]);
}
