'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  REALTIME_SUBSCRIBE_STATES,
} from '@supabase/supabase-js';
import { forwardPreviewFromStoredName } from '@/lib/chat/formatters';
import type { FormattedMessage } from '@/lib/types';
import {
  parseRealtimeEnvelope,
  realtimeDedupKey,
  type RealtimeEventName,
} from '@/lib/realtime/events';
import { RealtimeDeduper } from '@/lib/realtime/dedup';
import { getRealtimeManager } from '@/lib/realtime/manager';

export type RealtimeMeta = {
  event: RealtimeEventName;
  source: 'broadcast' | 'postgres';
  dedupKey: string;
  eventId: string;
};

type Handlers = {
  onMessage?: (payload: FormattedMessage, meta?: RealtimeMeta) => void;
  onMessageUpdate?: (payload: FormattedMessage, meta?: RealtimeMeta) => void;
  onTyping?: (data: { conversation_id: number; user_id: string }, meta?: RealtimeMeta) => void;
  onMemberRead?: (data: {
    conversation_id: number;
    user_id: string;
    last_read_at: string;
  }, meta?: RealtimeMeta) => void;
  onMessagesRead?: (data: {
    conversation_id: number;
    reader_id: string;
    read_at: string;
    message_ids: number[];
  }, meta?: RealtimeMeta) => void;
};

function rowToMessage(row: Record<string, unknown>, convId: number): FormattedMessage {
  const forwardedFromId = (row.forwarded_from_id as number | null) ?? null;
  const forwardedFromSenderName = (row.forwarded_from_sender_name as string | null) ?? null;
  const forwardedFromConversationId =
    (row.forwarded_from_conversation_id as number | null) ?? null;

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
    forwarded_from_id: forwardedFromId,
    forwarded_from: forwardPreviewFromStoredName(
      forwardedFromId,
      forwardedFromConversationId,
      forwardedFromSenderName,
    ),
    is_edited: !!row.is_edited,
    edited_at: row.edited_at as string | null,
    is_deleted: !!row.deleted_at,
    deleted_at: row.deleted_at as string | null,
    sender: null,
  };
}

function subscribeConversation(
  supabase: ReturnType<typeof getRealtimeManager>['client'],
  convId: number,
  handlersRef: RefObject<Handlers>,
  deduper: RealtimeDeduper,
  onUnhealthy?: () => void,
): RealtimeChannel {
  const emit = <K extends RealtimeEventName>(
    event: K,
    source: 'broadcast' | 'postgres',
    payload: unknown,
    cb?: (data: unknown, meta: RealtimeMeta) => void,
  ) => {
    if (!cb) return;
    if (source === 'broadcast') {
      const envelope = parseRealtimeEnvelope(event, payload);
      if (deduper.shouldSkip(envelope.meta.dedup_key)) return;
      cb(envelope.data, {
        event,
        source,
        dedupKey: envelope.meta.dedup_key,
        eventId: envelope.meta.event_id,
      });
      return;
    }
    const typedPayload = payload as never;
    const dedupKey = realtimeDedupKey(event, typedPayload);
    if (deduper.shouldSkip(dedupKey)) return;
    cb(payload, {
      event,
      source,
      dedupKey,
      eventId: `pg:${dedupKey}`,
    });
  };

  return supabase
    .channel(`conversation:${convId}`, {
      config: { broadcast: { self: false } },
    })
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
      (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
        emit('NewMessage', 'postgres', rowToMessage(payload.new as Record<string, unknown>, convId), (data, meta) =>
          handlersRef.current?.onMessage?.(
            data as FormattedMessage,
            meta,
          ),
        );
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
      (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
        emit(
          'MessageUpdated',
          'postgres',
          rowToMessage(payload.new as Record<string, unknown>, convId),
          (data, meta) =>
            handlersRef.current?.onMessageUpdate?.(
              data as FormattedMessage,
              meta,
            ),
        );
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${convId}` },
      (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
        const row = payload.new as Record<string, unknown>;
        const old = payload.old as Record<string, unknown> | undefined;

        const lastReadAt = row.last_read_at as string | null;
        if (lastReadAt && lastReadAt !== (old?.last_read_at as string | null | undefined)) {
          emit('MemberRead', 'postgres', {
            conversation_id: convId,
            user_id: row.user_id as string,
            last_read_at: lastReadAt,
          }, (data, meta) =>
            handlersRef.current?.onMemberRead?.(
              data as { conversation_id: number; user_id: string; last_read_at: string },
              meta,
            ),
          );
        }

        const lastTypingAt = row.last_typing_at as string | null;
        if (lastTypingAt && lastTypingAt !== (old?.last_typing_at as string | null | undefined)) {
          emit('UserTyping', 'postgres', {
            conversation_id: convId,
            user_id: row.user_id as string,
            last_typing_at: lastTypingAt,
          }, (data, meta) =>
            handlersRef.current?.onTyping?.(
              data as { conversation_id: number; user_id: string },
              meta,
            ),
          );
        }
      },
    )
    .on('broadcast', { event: 'UserTyping' }, (message: { payload: unknown }) => {
      emit('UserTyping', 'broadcast', message.payload, (data, meta) =>
        handlersRef.current?.onTyping?.(
          data as { conversation_id: number; user_id: string },
          meta,
        ),
      );
    })
    .on('broadcast', { event: 'NewMessage' }, (message: { payload: unknown }) => {
      const envelope = parseRealtimeEnvelope('NewMessage', message.payload);
      const msg = envelope.data;
      if (msg?.conversation_id !== convId) return;
      if (deduper.shouldSkip(envelope.meta.dedup_key)) return;
      handlersRef.current?.onMessage?.(msg, {
        event: 'NewMessage',
        source: 'broadcast',
        dedupKey: envelope.meta.dedup_key,
        eventId: envelope.meta.event_id,
      });
    })
    .on('broadcast', { event: 'MessageUpdated' }, (message: { payload: unknown }) => {
      const envelope = parseRealtimeEnvelope('MessageUpdated', message.payload);
      const msg = envelope.data;
      if (msg?.conversation_id !== convId) return;
      if (deduper.shouldSkip(envelope.meta.dedup_key)) return;
      handlersRef.current?.onMessageUpdate?.(msg, {
        event: 'MessageUpdated',
        source: 'broadcast',
        dedupKey: envelope.meta.dedup_key,
        eventId: envelope.meta.event_id,
      });
    })
    .on(
      'broadcast',
      { event: 'MessagesRead' },
      (message: { payload: unknown }) => {
        const envelope = parseRealtimeEnvelope('MessagesRead', message.payload);
        const data = envelope.data;
        if (data?.conversation_id === convId) {
          if (deduper.shouldSkip(envelope.meta.dedup_key)) return;
          handlersRef.current?.onMessagesRead?.(data, {
            event: 'MessagesRead',
            source: 'broadcast',
            dedupKey: envelope.meta.dedup_key,
            eventId: envelope.meta.event_id,
          });
        }
      },
    )
    .on(
      'broadcast',
      { event: 'MemberRead' },
      (message: { payload: unknown }) => {
        const envelope = parseRealtimeEnvelope('MemberRead', message.payload);
        const data = envelope.data;
        if (data?.conversation_id === convId) {
          if (deduper.shouldSkip(envelope.meta.dedup_key)) return;
          handlersRef.current?.onMemberRead?.(data, {
            event: 'MemberRead',
            source: 'broadcast',
            dedupKey: envelope.meta.dedup_key,
            eventId: envelope.meta.event_id,
          });
        }
      },
    )
    .subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        window.setTimeout(() => onUnhealthy?.(), 1500);
      }
    });
}

/** Realtime for the open chat only (one channel + server JWT). */
export function useActiveConversationRealtime(activeId: number | null, handlers: Handlers) {
  const handlersRef = useRef(handlers);
  const deduperRef = useRef(new RealtimeDeduper());
  handlersRef.current = handlers;

  useEffect(() => {
    if (!activeId) return;

    const manager = getRealtimeManager();
    const supabase = manager.client;
    manager.retainAuthLifecycle();
    let disposed = false;
    let channel: RealtimeChannel | null = null;
    let binding = false;

    const bind = async (hardReconnect = false) => {
      if (disposed || binding) return;
      binding = true;
      try {
        const authOk = await manager.prepare(hardReconnect);
        if (!authOk) {
          window.setTimeout(() => {
            if (!disposed) void bind(true);
          }, 1500);
          return;
        }
        if (disposed) return;
        if (channel) {
          await supabase.removeChannel(channel);
          channel = null;
        }
        channel = subscribeConversation(supabase, activeId, handlersRef, deduperRef.current, () => {
          if (!disposed) void bind(true);
        });
      } finally {
        binding = false;
      }
    };

    void bind(false);

    return () => {
      disposed = true;
      manager.releaseAuthLifecycle();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [activeId]);
}

/** Lightweight list updates: broadcast + postgres INSERT per conversation. */
export function useChatRealtime(conversationIdsKey: string, handlers: Pick<Handlers, 'onMessage'>) {
  const handlersRef = useRef(handlers);
  const deduperRef = useRef(new RealtimeDeduper());
  handlersRef.current = handlers;

  useEffect(() => {
    const conversationIds = conversationIdsKey
      ? conversationIdsKey.split(',').map((id) => Number(id))
      : [];
    if (conversationIds.length === 0) return;

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

        conversationIds.forEach((convId) => {
          const channel = supabase
            .channel(`conversation:${convId}`, {
              config: { broadcast: { self: false } },
            })
            .on(
              'postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
              (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
                const msg = rowToMessage(payload.new as Record<string, unknown>, convId);
                const dedupKey = realtimeDedupKey('NewMessage', msg as never);
                if (deduperRef.current.shouldSkip(dedupKey)) return;
                handlersRef.current.onMessage?.(
                  msg,
                  {
                    event: 'NewMessage',
                    source: 'postgres',
                    dedupKey,
                    eventId: `pg:${dedupKey}`,
                  },
                );
              },
            )
            .on('broadcast', { event: 'NewMessage' }, (message: { payload: unknown }) => {
              const envelope = parseRealtimeEnvelope('NewMessage', message.payload);
              const msg = envelope.data;
              if (msg?.conversation_id === convId) {
                if (deduperRef.current.shouldSkip(envelope.meta.dedup_key)) return;
                handlersRef.current.onMessage?.(msg, {
                  event: 'NewMessage',
                  source: 'broadcast',
                  dedupKey: envelope.meta.dedup_key,
                  eventId: envelope.meta.event_id,
                });
              }
            })
            .subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
              if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                window.setTimeout(() => {
                  if (!disposed) void bindAll(true);
                }, 1500);
              }
            });
          channels.push(channel);
        });
      } finally {
        binding = false;
      }
    };

    void bindAll(false);

    return () => {
      disposed = true;
      manager.releaseAuthLifecycle();
      channels.forEach((ch) => void supabase.removeChannel(ch));
    };
  }, [conversationIdsKey]);
}

export type ContactRequestPayload = {
  sender_id?: string;
  name?: string;
  last_name?: string;
  conversation_id?: number;
};

export type UserRealtimeHandlers = {
  onCallSignaling?: (payload: unknown, meta?: RealtimeMeta) => void;
  onUserMessage?: (payload: FormattedMessage, meta?: RealtimeMeta) => void;
  onContactsChanged?: (meta?: RealtimeMeta) => void;
  onContactRequest?: (payload: ContactRequestPayload, meta?: RealtimeMeta) => void;
};

export function useUserRealtime(userId: string | undefined, handlers: UserRealtimeHandlers) {
  const handlersRef = useRef(handlers);
  const deduperRef = useRef(new RealtimeDeduper());
  handlersRef.current = handlers;

  useEffect(() => {
    if (!userId) return;
    const manager = getRealtimeManager();
    const supabase = manager.client;
    manager.retainAuthLifecycle();
    let disposed = false;
    let channel: RealtimeChannel | null = null;
    let binding = false;

    const bind = async (hardReconnect = false) => {
      if (disposed || binding) return;
      binding = true;
      try {
        const authOk = await manager.prepare(hardReconnect);
        if (!authOk) {
          window.setTimeout(() => {
            if (!disposed) void bind(true);
          }, 1500);
          return;
        }
        if (disposed) return;
        if (channel) await supabase.removeChannel(channel);

        const notifyContacts = (meta?: RealtimeMeta) => handlersRef.current.onContactsChanged?.(meta);

        channel = supabase
          .channel(`user:${userId}`)
          .on('broadcast', { event: 'CallSignaling' }, (message: { payload: unknown }) => {
            const envelope = parseRealtimeEnvelope('CallSignaling', message.payload);
            if (deduperRef.current.shouldSkip(envelope.meta.dedup_key)) return;
            handlersRef.current.onCallSignaling?.(envelope.data, {
              event: 'CallSignaling',
              source: 'broadcast',
              dedupKey: envelope.meta.dedup_key,
              eventId: envelope.meta.event_id,
            });
          })
          .on('broadcast', { event: 'UserMessage' }, (message: { payload: unknown }) => {
            const envelope = parseRealtimeEnvelope('UserMessage', message.payload);
            if (deduperRef.current.shouldSkip(envelope.meta.dedup_key)) return;
            handlersRef.current.onUserMessage?.(envelope.data as FormattedMessage, {
              event: 'UserMessage',
              source: 'broadcast',
              dedupKey: envelope.meta.dedup_key,
              eventId: envelope.meta.event_id,
            });
          })
          .on(
            'broadcast',
            { event: 'ContactRequestSent' },
            (message: { payload: unknown }) => {
              const envelope = parseRealtimeEnvelope('ContactRequestSent', message.payload);
              if (deduperRef.current.shouldSkip(envelope.meta.dedup_key)) return;
              handlersRef.current.onContactRequest?.(envelope.data ?? {}, {
                event: 'ContactRequestSent',
                source: 'broadcast',
                dedupKey: envelope.meta.dedup_key,
                eventId: envelope.meta.event_id,
              });
              notifyContacts({
                event: 'ContactRequestSent',
                source: 'broadcast',
                dedupKey: envelope.meta.dedup_key,
                eventId: envelope.meta.event_id,
              });
            },
          )
          .on('broadcast', { event: 'ContactRequestAccepted' }, (message: { payload: unknown }) => {
            const envelope = parseRealtimeEnvelope('ContactRequestAccepted', message.payload);
            if (deduperRef.current.shouldSkip(envelope.meta.dedup_key)) return;
            notifyContacts({
              event: 'ContactRequestAccepted',
              source: 'broadcast',
              dedupKey: envelope.meta.dedup_key,
              eventId: envelope.meta.event_id,
            });
          })
          .on('broadcast', { event: 'ContactRequestRejected' }, (message: { payload: unknown }) => {
            const envelope = parseRealtimeEnvelope('ContactRequestRejected', message.payload);
            if (deduperRef.current.shouldSkip(envelope.meta.dedup_key)) return;
            notifyContacts({
              event: 'ContactRequestRejected',
              source: 'broadcast',
              dedupKey: envelope.meta.dedup_key,
              eventId: envelope.meta.event_id,
            });
          })
          .on('broadcast', { event: 'ContactRemoved' }, (message: { payload: unknown }) => {
            const envelope = parseRealtimeEnvelope('ContactRemoved', message.payload);
            if (deduperRef.current.shouldSkip(envelope.meta.dedup_key)) return;
            notifyContacts({
              event: 'ContactRemoved',
              source: 'broadcast',
              dedupKey: envelope.meta.dedup_key,
              eventId: envelope.meta.event_id,
            });
          })
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'user_contacts',
              filter: `contact_id=eq.${userId}`,
            },
            (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
              const row = payload.new as { id?: number | string; user_id?: string; status?: string };
              const dedupKey = `contact-request-sent:${row.user_id ?? 'unknown'}:${row.id ?? 'na'}`;
              if (deduperRef.current.shouldSkip(dedupKey)) return;
              if (row.status === 'pending' && row.user_id) {
                handlersRef.current.onContactRequest?.(
                  { sender_id: row.user_id },
                  {
                    event: 'ContactRequestSent',
                    source: 'postgres',
                    dedupKey,
                    eventId: `pg:${dedupKey}`,
                  },
                );
              }
              notifyContacts({
                event: 'ContactRequestSent',
                source: 'postgres',
                dedupKey,
                eventId: `pg:${dedupKey}`,
              });
            },
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
              const row = payload.new as {
                id?: number | string;
                user_id?: string;
                contact_id?: string;
                status?: string;
              };
              const old = payload.old as { status?: string } | null;
              if (row?.status !== 'accepted' || old?.status === 'accepted') return;
              const dedupKey = `contact-request-accepted:${row.user_id ?? userId}:${row.contact_id ?? 'unknown'}:${row.id ?? 'na'}`;
              if (deduperRef.current.shouldSkip(dedupKey)) return;
              notifyContacts({
                event: 'ContactRequestAccepted',
                source: 'postgres',
                dedupKey,
                eventId: `pg:${dedupKey}`,
              });
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
            (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
              const row = payload.new as {
                id?: number | string;
                user_id?: string;
                contact_id?: string;
                status?: string;
              };
              const old = payload.old as { status?: string } | null;
              if (row?.status !== 'accepted' || old?.status === 'accepted') return;
              const dedupKey = `contact-update:${row.contact_id ?? userId}:${row.user_id ?? 'unknown'}:${row.id ?? 'na'}`;
              if (deduperRef.current.shouldSkip(dedupKey)) return;
              notifyContacts({
                event: 'ContactRequestAccepted',
                source: 'postgres',
                dedupKey,
                eventId: `pg:${dedupKey}`,
              });
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'user_contacts',
              filter: `contact_id=eq.${userId}`,
            },
            (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
              const row = payload.old as { id?: number | string; user_id?: string; contact_id?: string } | null;
              const dedupKey = `contact-removed:${row?.contact_id ?? userId}:${row?.user_id ?? 'unknown'}:${row?.id ?? 'na'}`;
              if (deduperRef.current.shouldSkip(dedupKey)) return;
              notifyContacts({
                event: 'ContactRemoved',
                source: 'postgres',
                dedupKey,
                eventId: `pg:${dedupKey}`,
              });
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'user_contacts',
              filter: `user_id=eq.${userId}`,
            },
            (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
              const row = payload.old as { id?: number | string; user_id?: string; contact_id?: string } | null;
              const dedupKey = `contact-removed:self:${row?.user_id ?? userId}:${row?.contact_id ?? 'unknown'}:${row?.id ?? 'na'}`;
              if (deduperRef.current.shouldSkip(dedupKey)) return;
              notifyContacts({
                event: 'ContactRemoved',
                source: 'postgres',
                dedupKey,
                eventId: `pg:${dedupKey}`,
              });
            },
          )
          .subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              window.setTimeout(() => {
                if (!disposed) void bind(true);
              }, 1500);
            }
          });
      } finally {
        binding = false;
      }
    };

    void bind(false);

    return () => {
      disposed = true;
      manager.releaseAuthLifecycle();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId]);
}
