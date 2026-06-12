'use client';

import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { FormattedMessage, Profile } from '@/lib/types';
import type { ConversationListItem } from '@/lib/types';
import type { MemberRead } from '@/utils/groupReadStatus';
import type { SenderProfile } from '@/utils/messageSender';
import { enrichMessageReply, enrichMessageSender } from '@/utils/messageSender';
import { patchConversationFromMessage } from '@/utils/conversationList';
import type { RealtimeMeta } from '@/hooks/useChatRealtime';
import { RealtimeDeduper } from '@/lib/realtime/dedup';

type Options = {
  userId: string;
  isViewingConversation: (convId: number) => boolean;
  loadConversations: () => Promise<unknown>;
  notifyIncomingMessage: (msg: FormattedMessage) => void;
  setConversationReadLocal: (convId: number) => void;
  decryptConvMessages: (convId: number, messages: FormattedMessage[]) => Promise<FormattedMessage[]>;
  setConversations: Dispatch<SetStateAction<ConversationListItem[]>>;
  setMessages: Dispatch<SetStateAction<FormattedMessage[]>>;
  applyGroupRead: (
    messages: FormattedMessage[],
    membersRead: MemberRead[],
    convId: number,
  ) => FormattedMessage[];
  membersReadRef: MutableRefObject<MemberRead[]>;
  activeIdRef: MutableRefObject<number | null>;
  groupMembersRef: MutableRefObject<Map<string, SenderProfile>>;
  userRef: MutableRefObject<Profile>;
  conversationsRef: MutableRefObject<ConversationListItem[]>;
};

/**
 * Unified reducer for realtime incoming messages from broadcast/postgres sources.
 * Keeps list + active chat state in sync and deduplicates events.
 */
export function useRealtimeMessageReducer(options: Options) {
  const {
    userId,
    isViewingConversation,
    loadConversations,
    notifyIncomingMessage,
    setConversationReadLocal,
    decryptConvMessages,
    setConversations,
    setMessages,
    applyGroupRead,
    membersReadRef,
    activeIdRef,
    groupMembersRef,
    userRef,
    conversationsRef,
  } = options;

  const deduperRef = useRef(new RealtimeDeduper(10_000, 700));
  const syncingConversationsRef = useRef(new Set<number>());

  const ensureConversationVisible = useCallback(
    (convId: number) => {
      if (syncingConversationsRef.current.has(convId)) return;
      syncingConversationsRef.current.add(convId);
      const delays = [0, 800, 2200, 5000];
      void (async () => {
        try {
          for (const delayMs of delays) {
            if (delayMs > 0) {
              await new Promise((resolve) => window.setTimeout(resolve, delayMs));
            }
            await loadConversations().catch(() => null);
            if (conversationsRef.current.some((c) => c.id === convId)) {
              break;
            }
          }
        } finally {
          syncingConversationsRef.current.delete(convId);
        }
      })();
    },
    [loadConversations, conversationsRef],
  );

  return useCallback(
    (msg: FormattedMessage, meta?: RealtimeMeta) => {
      const convId = msg.conversation_id;
      if (!convId) return;

      const dedupKey = meta?.dedupKey ?? `legacy-message:${convId}:${msg.id}`;
      if (deduperRef.current.shouldSkip(dedupKey)) return;

      const fromOther = msg.user_id !== userId;
      const isSystem = (msg.message_type || 'user') === 'system';
      const viewing = isViewingConversation(convId);
      const previewMsg = enrichMessageSender(msg, groupMembersRef.current, userRef.current);
      const hasConversation = conversationsRef.current.some((c) => c.id === convId);
      if (!hasConversation) {
        // New private chat can appear slightly later than the first realtime message.
        // Retry list sync a few times to avoid "message appears only after manual refresh".
        ensureConversationVisible(convId);
      }

      setConversations((prev) => {
        if (!prev.some((c) => c.id === convId)) {
          return prev;
        }
        return patchConversationFromMessage(prev, convId, previewMsg, {
          incrementUnread: fromOther && !viewing && !isSystem,
          currentUserId: userId,
        });
      });

      if (fromOther && !isSystem && !viewing) {
        notifyIncomingMessage(previewMsg);
      }

      if (viewing && activeIdRef.current === convId) {
        setMessages((prev) => {
          const enriched = enrichMessageReply(previewMsg, prev);
          if (prev.some((m) => m.id === enriched.id)) return prev;
          return applyGroupRead([...prev, enriched], membersReadRef.current, convId);
        });
        fetch(`/api/chat/${convId}/messages/read`, {
          method: 'POST',
          credentials: 'include',
        }).catch(() => {});
        setConversationReadLocal(convId);
      }

      void (async () => {
        let displayMsg = previewMsg;
        if (!isSystem) {
          const [decrypted] = await decryptConvMessages(convId, [displayMsg]);
          displayMsg = decrypted ?? displayMsg;
        }

        setConversations((prev) => {
          if (!prev.some((c) => c.id === convId)) return prev;
          return patchConversationFromMessage(prev, convId, displayMsg, {
            incrementUnread: false,
            currentUserId: userId,
          });
        });

        if (viewing && activeIdRef.current === convId) {
          setMessages((prev) => {
            const enriched = enrichMessageReply(displayMsg, prev);
            const idx = prev.findIndex((m) => m.id === enriched.id);
            if (idx < 0) return prev;
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              ...enriched,
              forwarded_from: enriched.forwarded_from ?? next[idx]?.forwarded_from,
              forwarded_from_id: enriched.forwarded_from_id ?? next[idx]?.forwarded_from_id,
              e2e_plaintext: enriched.e2e_plaintext ?? next[idx]?.e2e_plaintext,
              e2e_file_name: enriched.e2e_file_name ?? next[idx]?.e2e_file_name,
            };
            return applyGroupRead(next, membersReadRef.current, convId);
          });
        }
      })();
    },
    [
      userId,
      isViewingConversation,
      notifyIncomingMessage,
      setConversationReadLocal,
      decryptConvMessages,
      setConversations,
      setMessages,
      applyGroupRead,
      membersReadRef,
      activeIdRef,
      groupMembersRef,
      userRef,
      conversationsRef,
      ensureConversationVisible,
    ],
  );
}
