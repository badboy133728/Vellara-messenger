'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { reconnectSupabaseRealtime } from '@/lib/realtime/clientAuth';
import { ensureRealtimeBoot, resetRealtimeBoot } from '@/lib/realtime/ready';

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
      void reconnectSupabaseRealtime(supabase).then((ok) => {
        if (!disposed && ok) void ensureRealtimeBoot(supabase);
      });
    };
    window.addEventListener('online', onOnline);

    return () => {
      disposed = true;
      window.removeEventListener('online', onOnline);
    };
  }, [userId]);
}
