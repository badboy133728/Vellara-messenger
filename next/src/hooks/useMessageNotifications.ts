'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationListItem, FormattedMessage } from '@/lib/types';
import {
  conversationTitle,
  formatIncomingMessagePreview,
} from '@/utils/conversationList';

export type MessageNotification = {
  conversationId: number;
  title: string;
  body: string;
};

export function useMessageNotifications() {
  const [notification, setNotification] = useState<MessageNotification | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationsRef = useRef<ConversationListItem[]>([]);

  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    Notification.requestPermission().catch(() => {});
  }, []);

  const syncConversations = useCallback((list: ConversationListItem[]) => {
    conversationsRef.current = list;
  }, []);

  const dismissNotification = useCallback(() => {
    setNotification(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const notifyIncomingMessage = useCallback(
    (msg: FormattedMessage, convList?: ConversationListItem[]) => {
      const list = convList ?? conversationsRef.current;
      const conv = list.find((c) => c.id === msg.conversation_id);
      const title = conv ? conversationTitle(conv) : 'Новое сообщение';
      const body = formatIncomingMessagePreview(msg);

      setNotification({
        conversationId: msg.conversation_id ?? 0,
        title,
        body,
      });

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setNotification(null);
        timerRef.current = null;
      }, 5000);

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const n = new Notification(title, {
            body,
            tag: `conv-${msg.conversation_id}`,
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return {
    notification,
    notifyIncomingMessage,
    dismissNotification,
    syncConversations,
  };
}
