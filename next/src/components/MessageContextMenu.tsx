'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { VellaraIcon } from '@/components/icons/VellaraIcon';

const MENU_VIEWPORT_EDGE = 12;

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
  const menuRef = useRef<HTMLDivElement>(null);
  const [desktopPos, setDesktopPos] = useState({ top: y, left: x });

  useLayoutEffect(() => {
    if (!show || isMobile) return;

    const menu = menuRef.current;
    if (!menu) return;

    const { width, height } = menu.getBoundingClientRect();
    const maxTop = window.innerHeight - height - MENU_VIEWPORT_EDGE;
    const maxLeft = window.innerWidth - width - MENU_VIEWPORT_EDGE;

    let top = y;
    if (top > maxTop) {
      top = Math.max(MENU_VIEWPORT_EDGE, y - height);
    }
    top = Math.min(Math.max(top, MENU_VIEWPORT_EDGE), Math.max(MENU_VIEWPORT_EDGE, maxTop));

    const left = Math.min(Math.max(x, MENU_VIEWPORT_EDGE), Math.max(MENU_VIEWPORT_EDGE, maxLeft));

    setDesktopPos({ top, left });
  }, [
    show,
    isMobile,
    x,
    y,
    canReply,
    canEdit,
    canDelete,
    canSave,
    canForward,
    canSelectForForward,
  ]);

  if (!show || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`msg-menu-backdrop ${isMobile ? '' : 'msg-menu-backdrop--desktop'}`}
      onClick={onClose}
    >
      <div
        ref={menuRef}
        className={`msg-context-menu ${isMobile ? 'msg-context-menu--sheet' : ''}`}
        style={isMobile ? undefined : { top: desktopPos.top, left: desktopPos.left }}
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
