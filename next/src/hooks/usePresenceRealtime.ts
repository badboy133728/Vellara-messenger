'use client';

import { useEffect, useRef } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

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
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
    })();
    const channels = uniqueIds.map((userId) =>
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

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [idsKey]);
}
