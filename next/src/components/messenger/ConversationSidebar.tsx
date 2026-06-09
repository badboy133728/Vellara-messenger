'use client';

import { useMemo, useRef, useState } from 'react';
import { storageDisplayUrl } from '@/lib/storage';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import { useLongPress } from '@/hooks/useLongPress';
import type { ConversationListItem } from '@/lib/types';
import { conversationTitle, sortConversations } from '@/utils/conversationList';
import { ConversationActionsMenu } from './ConversationActionsMenu';

type Tab = 'all' | 'unread' | 'archive';

function convAvatar(c: ConversationListItem): { type: 'image' | 'letter'; value: string } {
  if (c.type === 'group') {
    const letter = (c.title?.[0] || 'G').toUpperCase();
    return { type: 'letter', value: letter };
  }
  if (c.other_user?.avatar) {
    const url = storageDisplayUrl(c.other_user.avatar);
    if (url) return { type: 'image', value: url };
  }
  const letter =
    `${c.other_user?.name?.[0] || ''}${c.other_user?.last_name?.[0] || ''}`.toUpperCase() || '?';
  return { type: 'letter', value: letter };
}

function formatConvTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function ConversationSidebar({
  conversations,
  activeId,
  loading,
  isMobile = false,
  onSelect,
  onRefresh,
  onCreateGroup,
  onPinConversation,
  onArchiveConversation,
  onDeleteConversation,
}: {
  conversations: ConversationListItem[];
  activeId: number | null;
  loading: boolean;
  isMobile?: boolean;
  onSelect: (id: number) => void;
  onRefresh: () => void;
  onCreateGroup?: () => void;
  onPinConversation: (conv: ConversationListItem) => Promise<void>;
  onArchiveConversation: (conv: ConversationListItem) => Promise<void>;
  onDeleteConversation: (conv: ConversationListItem) => Promise<void>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [actionsMenu, setActionsMenu] = useState<{
    conv: ConversationListItem;
    x: number;
    y: number;
  } | null>(null);
  const menuCloseLockRef = useRef(0);

  const pinnedCount = conversations.filter((c) => c.is_pinned && !c.is_archived).length;
  const unreadCount = conversations.filter((c) => c.has_unread && !c.is_archived).length;

  const filtered = useMemo(() => {
    let list = conversations;
    if (activeTab === 'unread') list = list.filter((c) => c.has_unread && !c.is_archived);
    if (activeTab === 'archive') list = list.filter((c) => c.is_archived);
    else if (activeTab === 'all') list = list.filter((c) => !c.is_archived);

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const title = conversationTitle(c).toLowerCase();
        const preview = (c.last_message_preview || '').toLowerCase();
        return title.includes(q) || preview.includes(q);
      });
    }
    return sortConversations(list);
  }, [conversations, activeTab, searchQuery]);

  const openActionsMenu = (
    event: { clientX?: number; clientY?: number; preventDefault?: () => void },
    conv: ConversationListItem,
  ) => {
    event.preventDefault?.();
    if (Date.now() < menuCloseLockRef.current) return;
    menuCloseLockRef.current = Date.now() + 450;

    const clientX = event.clientX ?? 0;
    const clientY = event.clientY ?? 0;
    setActionsMenu({
      conv,
      x: Math.min(Math.max(clientX, 12), window.innerWidth - 220),
      y: Math.min(Math.max(clientY, 12), window.innerHeight - 200),
    });
  };

  const longPress = useLongPress((touchEvent) => {
    openActionsMenu(touchEvent, touchEvent.payload as ConversationListItem);
  });

  const closeActionsMenu = () => {
    if (Date.now() < menuCloseLockRef.current) return;
    setActionsMenu(null);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h2 className="sidebar-title">
          <VellaraIcon name="chats" size={20} className="sidebar-title__icon" />
          Диалоги
        </h2>
        <div className="sidebar-actions">
          {onCreateGroup && (
            <button type="button" className="btn-new-group" onClick={onCreateGroup}>
              <VellaraIcon name="plus" size={14} />
              Группа
            </button>
          )}
          <button type="button" className="btn-new-group btn-new-group--icon" onClick={onRefresh} aria-label="Обновить">
            <VellaraIcon name="refresh" size={16} />
          </button>
        </div>
      </div>

      <input
        className="search-input"
        placeholder="Поиск по имени или сообщению..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <div className="tabs">
        <button type="button" className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>
          Все
        </button>
        <button type="button" className={activeTab === 'unread' ? 'active' : ''} onClick={() => setActiveTab('unread')}>
          Непрочитанные
          {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
        </button>
        <button type="button" className={activeTab === 'archive' ? 'active' : ''} onClick={() => setActiveTab('archive')}>
          Архив
        </button>
      </div>

      {loading ? (
        <p className="loader">Загрузка...</p>
      ) : filtered.length === 0 ? (
        <p className="empty">{searchQuery ? 'Ничего не найдено' : 'Нет диалогов'}</p>
      ) : (
        <div className="conversation-list">
          {filtered.map((c) => {
            const av = convAvatar(c);
            const time =
              c.last_message && typeof c.last_message === 'object' && 'created_at' in c.last_message
                ? formatConvTime(String((c.last_message as { created_at: string }).created_at))
                : formatConvTime(c.updated_at);
            return (
              <button
                key={c.id}
                type="button"
                className={`conv-item ${activeId === c.id ? 'active' : ''} ${c.has_unread ? 'unread' : ''} ${c.is_pinned ? 'conv-item--pinned' : ''}`}
                onClick={() => onSelect(c.id)}
                onContextMenu={(e) => openActionsMenu(e, c)}
                onTouchStart={(e) => longPress.onTouchStart(e, c)}
                onTouchMove={longPress.onTouchMove}
                onTouchEnd={longPress.onTouchEnd}
                onTouchCancel={longPress.onTouchCancel}
              >
                <div className={`avatar-small ${c.type === 'group' ? 'avatar-small--group' : ''}`}>
                  {av.type === 'image' ? (
                    <img src={av.value} alt="" className="avatar-img" />
                  ) : (
                    <span className="avatar-letter">{av.value}</span>
                  )}
                </div>
                <div className="conv-info">
                  <div className="conv-row">
                    <div className="conv-name">
                      {c.is_pinned && (
                        <VellaraIcon name="pin" size={12} className="conv-item__pin-icon" />
                      )}
                      {conversationTitle(c)}
                    </div>
                    <span className="conv-time">{time}</span>
                  </div>
                  <div className={`conv-preview ${c.unread_count > 0 ? 'conv-preview--unread' : ''}`}>
                    {c.last_message_preview}
                  </div>
                </div>
                {c.unread_count > 0 && (
                  <span className="conv-unread-badge">
                    {c.unread_count > 99 ? '99+' : c.unread_count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {actionsMenu && (
        <ConversationActionsMenu
          conversation={actionsMenu.conv}
          x={actionsMenu.x}
          y={actionsMenu.y}
          isMobile={isMobile}
          pinnedCount={pinnedCount}
          onPin={() => {
            closeActionsMenu();
            void onPinConversation(actionsMenu.conv);
          }}
          onArchive={() => {
            closeActionsMenu();
            void onArchiveConversation(actionsMenu.conv);
          }}
          onDelete={() => {
            closeActionsMenu();
            void onDeleteConversation(actionsMenu.conv);
          }}
          onClose={closeActionsMenu}
        />
      )}
    </aside>
  );
}
