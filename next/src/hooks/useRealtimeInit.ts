'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { reconnectSupabaseRealtime } from '@/lib/realtime/clientAuth';

/** Гарантирует JWT и WebSocket до подписок в остальных realtime-хуках. */
export function useRealtimeInit(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    let disposed = false;
    let attempts = 0;

    const boot = async () => {
      if (disposed) return;
      const ok = await reconnectSupabaseRealtime(supabase);
      if (!ok && attempts < 8) {
        attempts += 1;
        window.setTimeout(() => void boot(), 1500);
      }
    };

    void boot();

    const onOnline = () => {
      if (!disposed) void reconnectSupabaseRealtime(supabase);
    };
    window.addEventListener('online', onOnline);

    return () => {
      disposed = true;
      window.removeEventListener('online', onOnline);
    };
  }, [userId]);
}
