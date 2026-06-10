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
  const isGroupAdmin = conversation.type === 'group' && conversation.my_role === 'admin';
  const isChannelAdmin = conversation.type === 'channel' && conversation.my_role === 'admin';
  const deleteLabel = isGroupAdmin
    ? 'Удалить группу'
    : isChannelAdmin
      ? 'Удалить канал'
      : 'Удалить чат';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`msg-menu-backdrop ${isMobile ? '' : 'msg-menu-backdrop--desktop'}`}
      onClick={onClose}
    >
      <div
        className={`msg-context-menu conv-actions-menu ${isMobile ? 'msg-context-menu--sheet' : 'msg-context-menu--popup'}`}
        style={isMobile ? undefined : { top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
        role="menu"
        aria-label="Действия с диалогом"
      >
        <p className="conv-actions-menu__title">{conversationTitle(conversation)}</p>
        <div className="msg-context-menu__list">
          <button
            type="button"
            className="msg-context-menu__list-item"
            disabled={!canPin && !conversation.is_pinned}
            title={
              !conversation.is_pinned && pinnedCount >= 3
                ? 'Можно закрепить не более 3 чатов'
                : undefined
            }
            onClick={onPin}
          >
            <VellaraIcon name="pin" size={18} />
            <span>{pinLabel}</span>
          </button>
          <button type="button" className="msg-context-menu__list-item" onClick={onArchive}>
            <VellaraIcon name="archive" size={18} />
            <span>{archiveLabel}</span>
          </button>
          <button
            type="button"
            className="msg-context-menu__list-item danger"
            onClick={onDelete}
          >
            <VellaraIcon name="trash" size={18} />
            <span>{deleteLabel}</span>
          </button>
        </div>
        {isMobile && (
          <button type="button" className="msg-context-menu__cancel" onClick={onClose}>
            Отмена
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
