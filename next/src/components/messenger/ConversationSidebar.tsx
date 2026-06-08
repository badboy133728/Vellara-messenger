'use client';

import { useMemo, useState } from 'react';
import { storageDisplayUrl } from '@/lib/storage';
import type { ConversationListItem } from '@/lib/types';

type Tab = 'all' | 'unread' | 'archive';

function convTitle(c: ConversationListItem) {
  if (c.type === 'group') return c.title ?? 'Группа';
  if (c.other_user) return `${c.other_user.name} ${c.other_user.last_name}`.trim();
  return 'Чат';
}

function convAvatar(c: ConversationListItem): { type: 'image' | 'letter'; value: string } {
  if (c.type === 'group') {
    const letter = (c.title?.[0] || 'G').toUpperCase();
    return { type: 'letter', value: letter };
  }
  if (c.other_user?.avatar) {
    const url = storageDisplayUrl(c.other_user.avatar);
    if (url) return { type: 'image', value: url };
  }
  const letter = `${c.other_user?.name?.[0] || ''}${c.other_user?.last_name?.[0] || ''}`.toUpperCase() || '?';
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
  onSelect,
  onRefresh,
  onCreateGroup,
}: {
  conversations: ConversationListItem[];
  activeId: number | null;
  loading: boolean;
  onSelect: (id: number) => void;
  onRefresh: () => void;
  onCreateGroup?: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('all');

  const unreadCount = conversations.filter((c) => c.has_unread && !c.is_archived).length;

  const filtered = useMemo(() => {
    let list = conversations;
    if (activeTab === 'unread') list = list.filter((c) => c.has_unread && !c.is_archived);
    if (activeTab === 'archive') list = list.filter((c) => c.is_archived);
    else if (activeTab === 'all') list = list.filter((c) => !c.is_archived);

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const title = convTitle(c).toLowerCase();
        const preview = (c.last_message_preview || '').toLowerCase();
        return title.includes(q) || preview.includes(q);
      });
    }
    return list;
  }, [conversations, activeTab, searchQuery]);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h2 className="sidebar-title">💬 Диалоги</h2>
        <div className="sidebar-actions">
          {onCreateGroup && (
            <button type="button" className="btn-new-group" onClick={onCreateGroup}>
              ＋ Группа
            </button>
          )}
          <button type="button" className="btn-new-group" onClick={onRefresh} aria-label="Обновить">
            ↻
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
                className={`conv-item ${activeId === c.id ? 'active' : ''} ${c.has_unread ? 'unread' : ''}`}
                onClick={() => onSelect(c.id)}
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
                    <div className="conv-name">{convTitle(c)}</div>
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
    </aside>
  );
}
