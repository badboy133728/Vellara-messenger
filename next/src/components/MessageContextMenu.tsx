'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { VellaraIcon, type VellaraIconName } from '@/components/icons/VellaraIcon';

const MENU_VIEWPORT_EDGE = 12;

type ToolAction = {
  key: string;
  icon: VellaraIconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
};

export function MessageContextMenu({
  show,
  x,
  y,
  isMobile,
  canReply,
  canCopy,
  canEdit,
  canDelete,
  canSave,
  isSaved,
  canForward,
  canSelect,
  onReply,
  onCopy,
  onForward,
  onSelect,
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
  canCopy?: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canSave: boolean;
  isSaved: boolean;
  canForward?: boolean;
  canSelect?: boolean;
  onReply?: () => void;
  onCopy?: () => void;
  onForward?: () => void;
  onSelect?: () => void;
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
    canCopy,
    canEdit,
    canDelete,
    canSave,
    canForward,
    canSelect,
  ]);

  if (!show || typeof document === 'undefined') return null;

  const toolbar: ToolAction[] = [];
  if (canReply && onReply) {
    toolbar.push({ key: 'reply', icon: 'reply', label: 'Ответить', onClick: onReply });
  }
  if (canCopy && onCopy) {
    toolbar.push({ key: 'copy', icon: 'copy', label: 'Копировать', onClick: onCopy });
  }
  if (canForward && onForward) {
    toolbar.push({ key: 'forward', icon: 'forward', label: 'Переслать', onClick: onForward });
  }
  if (canDelete) {
    toolbar.push({
      key: 'delete',
      icon: 'trash',
      label: 'Удалить',
      onClick: onDelete,
      danger: true,
    });
  }
  if (canSelect && onSelect) {
    toolbar.push({ key: 'select', icon: 'select', label: 'Выбрать', onClick: onSelect });
  }

  const listItems: Array<{
    key: string;
    label: string;
    icon?: VellaraIconName;
    onClick: () => void;
    danger?: boolean;
  }> = [];

  if (canSave) {
    listItems.push({
      key: 'save',
      icon: isSaved ? 'star' : 'star-outline',
      label: isSaved ? 'Убрать из избранного' : 'Сохранить в избранное',
      onClick: onSave,
    });
  }
  if (canEdit) {
    listItems.push({
      key: 'edit',
      icon: 'edit',
      label: 'Редактировать',
      onClick: onEdit,
    });
  }

  const run = (fn: () => void) => {
    fn();
    onClose();
  };

  return createPortal(
    <div
      className={`msg-menu-backdrop ${isMobile ? '' : 'msg-menu-backdrop--desktop'}`}
      onClick={onClose}
    >
      <div
        ref={menuRef}
        className={`msg-context-menu ${isMobile ? 'msg-context-menu--sheet' : 'msg-context-menu--popup'}`}
        style={isMobile ? undefined : { top: desktopPos.top, left: desktopPos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        {toolbar.length > 0 && (
          <div className="msg-context-menu__toolbar" role="toolbar" aria-label="Действия с сообщением">
            {toolbar.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`msg-context-menu__tool${item.danger ? ' msg-context-menu__tool--danger' : ''}`}
                onClick={() => run(item.onClick)}
              >
                <span className="msg-context-menu__tool-icon">
                  <VellaraIcon name={item.icon} size={22} />
                </span>
                <span className="msg-context-menu__tool-label">{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {listItems.length > 0 && (
          <div className="msg-context-menu__list">
            {listItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`msg-context-menu__list-item${item.danger ? ' danger' : ''}`}
                onClick={() => run(item.onClick)}
              >
                {item.icon && <VellaraIcon name={item.icon} size={18} />}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}

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
