'use client';

import { useEffect, useRef } from 'react';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  REALTIME_SUBSCRIBE_STATES,
} from '@supabase/supabase-js';
import { getRealtimeManager } from '@/lib/realtime/manager';

const PRESENCE_CHANNEL_LIMIT = 30;

export function usePresenceRealtime(
  userIds: string[],
  onUpdate: (userId: string, lastSeenAt: string | null) => void,
) {
  const handlerRef = useRef(onUpdate);
  handlerRef.current = onUpdate;

  const idsKey = [...new Set(userIds)].sort().slice(0, PRESENCE_CHANNEL_LIMIT).join(',');

  useEffect(() => {
    const uniqueIds = idsKey ? idsKey.split(',') : [];
    if (uniqueIds.length === 0) return;

    const manager = getRealtimeManager();
    const supabase = manager.client;
    manager.retainAuthLifecycle();
    let disposed = false;
    const channels: RealtimeChannel[] = [];
    let binding = false;

    const bindAll = async (hardReconnect = false) => {
      if (disposed || binding) return;
      binding = true;
      try {
        const authOk = await manager.prepare(hardReconnect);
        if (!authOk) {
          window.setTimeout(() => {
            if (!disposed) void bindAll(true);
          }, 1500);
          return;
        }
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
              .subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                  window.setTimeout(() => {
                    if (!disposed) void bindAll(true);
                  }, 1500);
                }
              }),
          );
        });
      } finally {
        binding = false;
      }
    };

    void bindAll(false);

    return () => {
      disposed = true;
      manager.releaseAuthLifecycle();
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [idsKey]);
}
