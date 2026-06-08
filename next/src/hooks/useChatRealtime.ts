'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
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

export function useChatRealtime(conversationIds: number[], handlers: Handlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (conversationIds.length === 0) return;

    const supabase = createClient();
    const channels = conversationIds.map((convId) => {
      const pgChannel = supabase
        .channel(`conversation:${convId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            handlersRef.current.onMessage?.({
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
              is_edited: !!row.is_edited,
              edited_at: row.edited_at as string | null,
              is_deleted: !!row.deleted_at,
              deleted_at: row.deleted_at as string | null,
              sender: null,
            });
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            handlersRef.current.onMessageUpdate?.({
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
              is_edited: !!row.is_edited,
              edited_at: row.edited_at as string | null,
              is_deleted: !!row.deleted_at,
              deleted_at: row.deleted_at as string | null,
              sender: null,
            });
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${convId}` },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            const lastReadAt = row.last_read_at as string | null;
            if (!lastReadAt) return;
            handlersRef.current.onMemberRead?.({
              conversation_id: convId,
              user_id: row.user_id as string,
              last_read_at: lastReadAt,
            });
          },
        )
        .on('broadcast', { event: 'UserTyping' }, ({ payload }) => {
          handlersRef.current.onTyping?.(payload as { conversation_id: number; user_id: string });
        })
        .subscribe();

      return pgChannel;
    });

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [conversationIds]);
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

    const notifyContacts = () => handlersRef.current.onContactsChanged?.();

    const channel = supabase
      .channel(`user:${userId}`)
      .on('broadcast', { event: 'CallSignaling' }, ({ payload }) =>
        handlersRef.current.onCallSignaling?.(payload),
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
        (payload) => {
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
