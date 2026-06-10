'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ensureRealtimeBoot, resetRealtimeBoot } from '@/lib/realtime/ready';
import { reconnectSupabaseRealtime } from '@/lib/realtime/clientAuth';

/** Один soft-connect при входе; hard-reconnect только после offline. */
export function useRealtimeInit(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    let disposed = false;

    void ensureRealtimeBoot(supabase);

    const onOnline = () => {
      if (disposed) return;
      resetRealtimeBoot();
      void reconnectSupabaseRealtime(supabase).then(() => {
        if (!disposed) void ensureRealtimeBoot(supabase);
      });
    };
    window.addEventListener('online', onOnline);

    return () => {
      disposed = true;
      window.removeEventListener('online', onOnline);
    };
  }, [userId]);
}
