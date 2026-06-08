'use client';

import { createPortal } from 'react-dom';

export function MessageContextMenu({
  show,
  x,
  y,
  isMobile,
  canReply,
  canEdit,
  canDelete,
  canSave,
  isSaved,
  onReply,
  onSave,
  onEdit,
  onDelete,
  onClose,
}: {
  show: boolean;
  x: number;
  y: number;
  isMobile: boolean;
  canReply?: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canSave: boolean;
  isSaved: boolean;
  onReply?: () => void;
  onSave: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  if (!show || typeof document === 'undefined') return null;

  return createPortal(
    <div className="msg-menu-backdrop" onClick={onClose}>
      <div
        className={`msg-context-menu ${isMobile ? 'msg-context-menu--sheet' : ''}`}
        style={isMobile ? undefined : { top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
      >
        {canReply && onReply && (
          <button type="button" onClick={onReply}>
            ↩ Ответить
          </button>
        )}
        {canSave && (
          <button type="button" onClick={onSave}>
            {isSaved ? '★ Убрать из избранного' : '☆ Сохранить в избранное'}
          </button>
        )}
        {canEdit && (
          <button type="button" onClick={onEdit}>
            Редактировать
          </button>
        )}
        {canDelete && (
          <button type="button" className="danger" onClick={onDelete}>
            Удалить
          </button>
        )}
        <button type="button" className="msg-context-menu__cancel" onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>,
    document.body,
  );
}
