'use client';

import { useEffect } from 'react';
import { getRealtimeManager } from '@/lib/realtime/manager';
import { realtimeV2Enabled } from '@/lib/realtime/flags';

/** Один soft-connect при входе; hard-reconnect только после offline. */
export function useRealtimeInit(userId: string | undefined) {
  useEffect(() => {
    if (!userId || !realtimeV2Enabled) return;
    const manager = getRealtimeManager();
    let disposed = false;

    void manager.prepare(false);

    const onOnline = () => {
      if (disposed) return;
      void manager.reconnectAfterOnline().then(() => {
        if (!disposed) void manager.prepare(false);
      });
    };
    window.addEventListener('online', onOnline);

    return () => {
      disposed = true;
      window.removeEventListener('online', onOnline);
    };
  }, [userId]);
}
