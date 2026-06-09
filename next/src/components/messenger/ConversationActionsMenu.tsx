'use client';

import { createPortal } from 'react-dom';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import type { ConversationListItem } from '@/lib/types';
import { conversationTitle } from '@/utils/conversationList';

export function ConversationActionsMenu({
  conversation,
  x,
  y,
  isMobile,
  pinnedCount,
  onPin,
  onArchive,
  onDelete,
  onClose,
}: {
  conversation: ConversationListItem;
  x: number;
  y: number;
  isMobile: boolean;
  pinnedCount: number;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const canPin = !conversation.is_archived && (!conversation.is_pinned ? pinnedCount < 3 : true);
  const pinLabel = conversation.is_pinned ? 'Открепить' : 'Закрепить';
  const archiveLabel = conversation.is_archived ? 'Вернуть из архива' : 'В архив';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="msg-menu-backdrop" onClick={onClose}>
      <div
        className={`msg-context-menu conv-actions-menu ${isMobile ? 'msg-context-menu--sheet' : ''}`}
        style={isMobile ? undefined : { top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="conv-actions-menu__title">{conversationTitle(conversation)}</p>
        <button
          type="button"
          className="msg-context-menu__item--with-icon"
          disabled={!canPin && !conversation.is_pinned}
          title={
            !conversation.is_pinned && pinnedCount >= 3
              ? 'Можно закрепить не более 3 чатов'
              : undefined
          }
          onClick={onPin}
        >
          <VellaraIcon name="pin" size={16} />
          {pinLabel}
        </button>
        <button type="button" className="msg-context-menu__item--with-icon" onClick={onArchive}>
          <VellaraIcon name="archive" size={16} />
          {archiveLabel}
        </button>
        <button type="button" className="msg-context-menu__item--with-icon danger" onClick={onDelete}>
          <VellaraIcon name="trash" size={16} />
          Удалить чат
        </button>
        <button type="button" className="msg-context-menu__cancel" onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>,
    document.body,
  );
}
