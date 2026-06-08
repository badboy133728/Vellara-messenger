'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type {
  AuthChangeEvent,
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  REALTIME_SUBSCRIBE_STATES,
  Session,
} from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { syncSupabaseRealtimeAuth } from '@/lib/realtime/clientAuth';
import type { FormattedMessage } from '@/lib/types';

type Handlers = {
  onMessage?: (payload: FormattedMessage) => void;
  onMessageUpdate?: (payload: FormattedMessage) => void;
  onTyping?: (data: { conversation_id: number; user_id: string }) => void;
  onMemberRead?: (data: {
    conversation_id: number;
    user_id: string;
    last_read_at: string;
  }) => void;
};

function rowToMessage(row: Record<string, unknown>, convId: number): FormattedMessage {
  return {
    id: row.id as number,
    conversation_id: convId,
    message_type: (row.message_type as string) ?? 'user',
    content: (row.content as string) ?? '',
    user_id: row.user_id as string,
    created_at: row.created_at as string,
    read_at: row.read_at as string | null,
    file_path: row.file_path as string | null,
    file_type: row.file_type as string | null,
    file_original_name: row.file_original_name as string | null,
    voice_duration: row.voice_duration as number | null,
    album_group_id: row.album_group_id as string | null,
    reply_to_id: (row.reply_to_id as number | null) ?? null,
    is_edited: !!row.is_edited,
    edited_at: row.edited_at as string | null,
    is_deleted: !!row.deleted_at,
    deleted_at: row.deleted_at as string | null,
    sender: null,
  };
}

function subscribeConversation(
  supabase: ReturnType<typeof createClient>,
  convId: number,
  handlersRef: RefObject<Handlers>,
  onResubscribe: (channel: RealtimeChannel) => void,
): RealtimeChannel {
  const channel = supabase
    .channel(`conversation:${convId}`, {
      config: { broadcast: { self: false } },
    })
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
      (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
        handlersRef.current?.onMessage?.(
          rowToMessage(payload.new as Record<string, unknown>, convId),
        );
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
      (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
        handlersRef.current?.onMessageUpdate?.(
          rowToMessage(payload.new as Record<string, unknown>, convId),
        );
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${convId}` },
      (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
        const row = payload.new as Record<string, unknown>;
        const lastReadAt = row.last_read_at as string | null;
        if (!lastReadAt) return;
        handlersRef.current?.onMemberRead?.({
          conversation_id: convId,
          user_id: row.user_id as string,
          last_read_at: lastReadAt,
        });
      },
    )
    .on('broadcast', { event: 'UserTyping' }, (message: { payload: { conversation_id: number; user_id: string } }) => {
      handlersRef.current?.onTyping?.(message.payload);
    })
    .on('broadcast', { event: 'NewMessage' }, (message: { payload: FormattedMessage }) => {
      const msg = message.payload;
      if (msg?.conversation_id === convId) {
        handlersRef.current?.onMessage?.(msg);
      }
    })
    .subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        window.setTimeout(() => {
          supabase.removeChannel(channel);
          onResubscribe(subscribeConversation(supabase, convId, handlersRef, onResubscribe));
        }, 2000);
      }
    });

  return channel;
}

/** Realtime for the open chat only (reliable: one channel + server JWT). */
export function useActiveConversationRealtime(activeId: number | null, handlers: Handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!activeId) return;

    const supabase = createClient();
    let disposed = false;
    let channel: RealtimeChannel | null = null;

    const attach = (ch: RealtimeChannel) => {
      channel = ch;
    };

    const resubscribe = (ch: RealtimeChannel) => {
      if (disposed) return;
      attach(ch);
    };

    void (async () => {
      await syncSupabaseRealtimeAuth(supabase);
      if (disposed) return;
      attach(subscribeConversation(supabase, activeId, handlersRef, resubscribe));
    })();

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session?.access_token) {
        void supabase.realtime.setAuth(session.access_token);
      } else {
        void syncSupabaseRealtimeAuth(supabase);
      }
    });

    const refreshAuth = window.setInterval(() => {
      void syncSupabaseRealtimeAuth(supabase);
    }, 4 * 60 * 1000);

    return () => {
      disposed = true;
      window.clearInterval(refreshAuth);
      authSubscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [activeId]);
}

/** Lightweight list updates: postgres INSERT on all user conversations. */
export function useChatRealtime(conversationIdsKey: string, handlers: Pick<Handlers, 'onMessage'>) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const conversationIds = conversationIdsKey
      ? conversationIdsKey.split(',').map((id) => Number(id))
      : [];
    if (conversationIds.length === 0) return;

    const supabase = createClient();
    let disposed = false;
    const channels: RealtimeChannel[] = [];

    void (async () => {
      await syncSupabaseRealtimeAuth(supabase);
      if (disposed) return;

      conversationIds.forEach((convId) => {
        const channel = supabase
          .channel(`conversation-list:${convId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
            (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
              handlersRef.current.onMessage?.(
                rowToMessage(payload.new as Record<string, unknown>, convId),
              );
            },
          )
          .on('broadcast', { event: 'NewMessage' }, (message: { payload: FormattedMessage }) => {
            const msg = message.payload;
            if (msg?.conversation_id === convId) {
              handlersRef.current.onMessage?.(msg);
            }
          })
          .subscribe();
        channels.push(channel);
      });
    })();

    return () => {
      disposed = true;
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [conversationIdsKey]);
}

export type UserRealtimeHandlers = {
  onCallSignaling?: (payload: unknown) => void;
  onContactsChanged?: () => void;
};

export function useUserRealtime(userId: string | undefined, handlers: UserRealtimeHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let disposed = false;

    const notifyContacts = () => handlersRef.current.onContactsChanged?.();

    void (async () => {
      await syncSupabaseRealtimeAuth(supabase);
      if (disposed) return;
    })();

    const channel = supabase
      .channel(`user:${userId}`)
      .on('broadcast', { event: 'CallSignaling' }, (message: { payload: unknown }) =>
        handlersRef.current.onCallSignaling?.(message.payload),
      )
      .on('broadcast', { event: 'ContactRequestSent' }, notifyContacts)
      .on('broadcast', { event: 'ContactRequestAccepted' }, notifyContacts)
      .on('broadcast', { event: 'ContactRemoved' }, notifyContacts)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_contacts',
          filter: `contact_id=eq.${userId}`,
        },
        notifyContacts,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_contacts',
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
          const row = payload.new as { status?: string };
          if (row?.status === 'accepted') notifyContacts();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_contacts',
          filter: `contact_id=eq.${userId}`,
        },
        notifyContacts,
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'user_contacts' },
        notifyContacts,
      )
      .subscribe();

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (session?.access_token) {
        void supabase.realtime.setAuth(session.access_token);
      } else {
        void syncSupabaseRealtimeAuth(supabase);
      }
    });

    return () => {
      disposed = true;
      authSubscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
