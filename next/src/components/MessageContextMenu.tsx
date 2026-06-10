'use client';

import { createPortal } from 'react-dom';
import { VellaraIcon } from '@/components/icons/VellaraIcon';

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
  canForward,
  canSelectForForward,
  onReply,
  onForward,
  onSelectForForward,
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
  canForward?: boolean;
  canSelectForForward?: boolean;
  onReply?: () => void;
  onForward?: () => void;
  onSelectForForward?: () => void;
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
          <button type="button" className="msg-context-menu__item--with-icon" onClick={onReply}>
            <VellaraIcon name="reply" size={16} />
            Ответить
          </button>
        )}
        {canForward && onForward && (
          <button type="button" className="msg-context-menu__item--with-icon" onClick={onForward}>
            <VellaraIcon name="forward" size={16} />
            Переслать
          </button>
        )}
        {canSelectForForward && onSelectForForward && (
          <button type="button" className="msg-context-menu__item--with-icon" onClick={onSelectForForward}>
            <VellaraIcon name="check" size={16} />
            Выбрать для пересылки
          </button>
        )}
        {canSave && (
          <button type="button" className="msg-context-menu__item--with-icon" onClick={onSave}>
            <VellaraIcon name={isSaved ? 'star' : 'star-outline'} size={16} />
            {isSaved ? 'Убрать из избранного' : 'Сохранить в избранное'}
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
