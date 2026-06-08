'use client';

import { useEffect, useRef } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { reconnectSupabaseRealtime } from '@/lib/realtime/clientAuth';

export function usePresenceRealtime(
  userIds: string[],
  onUpdate: (userId: string, lastSeenAt: string | null) => void,
) {
  const handlerRef = useRef(onUpdate);
  handlerRef.current = onUpdate;

  const idsKey = [...new Set(userIds)].sort().join(',');

  useEffect(() => {
    const uniqueIds = idsKey ? idsKey.split(',') : [];
    if (uniqueIds.length === 0) return;

    const supabase = createClient();
    let disposed = false;
    const channels: RealtimeChannel[] = [];

    const bindAll = async () => {
      await reconnectSupabaseRealtime(supabase);
      if (disposed) return;
      while (channels.length) {
        const ch = channels.pop();
        if (ch) await supabase.removeChannel(ch);
      }
      uniqueIds.forEach((userId) => {
        channels.push(
          supabase
            .channel(`presence:${userId}`)
            .on(
              'postgres_changes',
              { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
              (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
                const row = payload.new as { id?: string; last_seen_at?: string | null };
                if (!row.id) return;
                handlerRef.current(row.id, row.last_seen_at ?? null);
              },
            )
            .subscribe(),
        );
      });
    };

    void bindAll();

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !disposed) void bindAll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [idsKey]);
}
