'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { storageDisplayUrl } from '@/lib/storage';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import { useLongPress } from '@/hooks/useLongPress';
import type { ConversationListItem } from '@/lib/types';
import { conversationTitle, sortConversations } from '@/utils/conversationList';
import { ConversationActionsMenu } from './ConversationActionsMenu';
import { ChannelPreviewModal } from './ChannelPreviewModal';

type Tab = 'all' | 'unread' | 'archive' | 'channels';
type SortMode = 'activity' | 'name';
type ChannelSearchItem = {
  id: number;
  title: string;
  description: string | null;
  avatar: string | null;
  members_count: number;
  is_subscribed: boolean;
};

function convAvatar(c: ConversationListItem): { type: 'image' | 'letter'; value: string } {
  if (c.type === 'group') {
    if (c.avatar) {
      const url = storageDisplayUrl(c.avatar);
      if (url) return { type: 'image', value: url };
    }
    const letter = (c.title?.[0] || 'G').toUpperCase();
    return { type: 'letter', value: letter };
  }
  if (c.type === 'channel') {
    if (c.avatar) {
      const url = storageDisplayUrl(c.avatar);
      if (url) return { type: 'image', value: url };
    }
    const letter = (c.title?.[0] || 'C').toUpperCase();
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
  onCreateChannel,
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
  onCreateChannel?: () => void;
  onPinConversation: (conv: ConversationListItem) => Promise<void>;
  onArchiveConversation: (conv: ConversationListItem) => Promise<void>;
  onDeleteConversation: (conv: ConversationListItem) => Promise<void>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [sortMode, setSortMode] = useState<SortMode>('activity');
  const [channelSearchItems, setChannelSearchItems] = useState<ChannelSearchItem[]>([]);
  const [isSearchingChannels, setIsSearchingChannels] = useState(false);
  const [subscribingChannelId, setSubscribingChannelId] = useState<number | null>(null);
  const [previewChannelId, setPreviewChannelId] = useState<number | null>(null);
  const [actionsMenu, setActionsMenu] = useState<{
    conv: ConversationListItem;
    x: number;
    y: number;
  } | null>(null);
  const menuCloseLockRef = useRef(0);

  const pinnedCount = conversations.filter((c) => c.is_pinned && !c.is_archived).length;
  const unreadCount = conversations.filter((c) => c.has_unread && !c.is_archived).length;

  useEffect(() => {
    if (activeTab !== 'channels') {
      setChannelSearchItems([]);
      setIsSearchingChannels(false);
      return;
    }
    const query = searchQuery.trim();
    if (query.length < 2) {
      setChannelSearchItems([]);
      setIsSearchingChannels(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsSearchingChannels(true);
      api<ChannelSearchItem[]>(`/api/chat/channels?query=${encodeURIComponent(query)}`)
        .then((rows) => {
          if (cancelled) return;
          setChannelSearchItems(rows ?? []);
        })
        .catch(() => {
          if (cancelled) return;
          setChannelSearchItems([]);
        })
        .finally(() => {
          if (!cancelled) setIsSearchingChannels(false);
        });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTab, searchQuery]);

  const filtered = useMemo(() => {
    let list = conversations;
    if (activeTab === 'unread') list = list.filter((c) => c.has_unread && !c.is_archived);
    if (activeTab === 'archive') list = list.filter((c) => c.is_archived);
    else if (activeTab === 'channels') list = list.filter((c) => c.type === 'channel' && !c.is_archived);
    else if (activeTab === 'all') list = list.filter((c) => !c.is_archived);

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const title = conversationTitle(c).toLowerCase();
        const preview = (c.last_message_preview || '').toLowerCase();
        return title.includes(q) || preview.includes(q);
      });
    }
    if (sortMode === 'name') {
      return [...list].sort((a, b) =>
        conversationTitle(a).localeCompare(conversationTitle(b), 'ru', { sensitivity: 'base' }),
      );
    }
    return sortConversations(list);
  }, [conversations, activeTab, searchQuery, sortMode]);

  const discoveredChannels = useMemo(() => {
    if (activeTab !== 'channels') return [];
    const query = searchQuery.trim();
    if (query.length < 2) return [];
    const existingIds = new Set(filtered.map((c) => c.id));
    return channelSearchItems.filter((item) => !existingIds.has(item.id));
  }, [activeTab, channelSearchItems, filtered, searchQuery]);

  const subscribeToChannel = async (channelId: number) => {
    setSubscribingChannelId(channelId);
    try {
      await api(`/api/chat/channels/${channelId}/subscribe`, { method: 'POST' });
      await Promise.resolve(onRefresh());
      onSelect(channelId);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось подписаться на канал');
    } finally {
      setSubscribingChannelId(null);
    }
  };

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

  const listSections = useMemo(() => {
    if (activeTab !== 'all') {
      return [{ key: 'main', title: null as string | null, items: filtered }];
    }
    const chats = filtered.filter((c) => c.type !== 'channel');
    const channels = filtered.filter((c) => c.type === 'channel');
    const sections: Array<{ key: string; title: string | null; items: ConversationListItem[] }> = [];
    if (chats.length) sections.push({ key: 'chats', title: 'Чаты', items: chats });
    if (channels.length) sections.push({ key: 'channels', title: 'Каналы', items: channels });
    return sections.length ? sections : [{ key: 'main', title: null, items: filtered }];
  }, [activeTab, filtered]);

  const renderConversationItem = (c: ConversationListItem) => {
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
        <div
          className={`avatar-small ${c.type === 'group' ? 'avatar-small--group' : ''} ${c.type === 'channel' ? 'avatar-small--channel' : ''}`}
        >
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
  };

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
          {onCreateChannel && (
            <button type="button" className="btn-new-group btn-new-group--channel" onClick={onCreateChannel}>
              <VellaraIcon name="channel" size={14} />
              Канал
            </button>
          )}
          <button type="button" className="btn-new-group btn-new-group--icon" onClick={onRefresh} aria-label="Обновить">
            <VellaraIcon name="refresh" size={16} />
          </button>
        </div>
      </div>

      <input
        className="search-input"
        placeholder={
          activeTab === 'channels'
            ? 'Поиск среди всех каналов...'
            : 'Поиск по имени или сообщению...'
        }
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
        <button type="button" className={activeTab === 'channels' ? 'active' : ''} onClick={() => setActiveTab('channels')}>
          Каналы
        </button>
      </div>

      <div className="sidebar-sort">
        <span className="sidebar-sort__label">Сортировка</span>
        <select
          className="sidebar-sort__select"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
        >
          <option value="activity">По активности</option>
          <option value="name">По названию</option>
        </select>
      </div>

      {loading ? (
        <p className="loader">Загрузка...</p>
      ) : filtered.length === 0 && discoveredChannels.length === 0 ? (
        <p className="empty">
          {activeTab === 'channels' && searchQuery.trim().length < 2
            ? 'Введите минимум 2 символа для поиска каналов'
            : searchQuery
              ? 'Ничего не найдено'
              : 'Нет диалогов'}
        </p>
      ) : (
        <div className="conversation-list">
          {listSections.map((section) => (
            <div key={section.key} className="conversation-list__section">
              {section.title && (
                <p className="conversation-list__section-title">{section.title}</p>
              )}
              {section.items.map((c) => renderConversationItem(c))}
            </div>
          ))}
          {activeTab === 'channels' && searchQuery.trim().length >= 2 && (
            <>
              <p className="conv-discover-title">Все каналы</p>
              {isSearchingChannels && (
                <p className="loader conv-discover-loader">Поиск каналов...</p>
              )}
              {discoveredChannels.map((channel) => {
                const avatarUrl = channel.avatar ? storageDisplayUrl(channel.avatar) : null;
                return (
                  <div key={`discover-${channel.id}`} className="conv-item conv-item--discover">
                    <div
                      className={`avatar-small avatar-small--channel ${channel.is_subscribed ? '' : 'avatar-small--ghost-channel'}`}
                    >
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="avatar-img" />
                      ) : (
                        <span className="avatar-letter">
                          {(channel.title?.[0] || 'C').toUpperCase()}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="conv-item__main"
                      onClick={() => {
                        if (!channel.is_subscribed) {
                          setPreviewChannelId(channel.id);
                          return;
                        }
                        void Promise.resolve(onRefresh()).then(() => onSelect(channel.id));
                      }}
                      title={channel.is_subscribed ? 'Открыть канал' : 'Предпросмотр канала'}
                    >
                      <div className="conv-info">
                        <div className="conv-row">
                          <div className="conv-name">{channel.title || 'Канал'}</div>
                        </div>
                        <div className="conv-preview">
                          {channel.description?.trim() || `${channel.members_count} подписчиков`}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`conv-item__subscribe ${channel.is_subscribed ? 'conv-item__subscribe--open' : ''}`}
                      onClick={() => {
                        if (channel.is_subscribed) {
                          void Promise.resolve(onRefresh()).then(() => onSelect(channel.id));
                          return;
                        }
                        void subscribeToChannel(channel.id);
                      }}
                      disabled={subscribingChannelId === channel.id}
                    >
                      {subscribingChannelId === channel.id
                        ? '...'
                        : channel.is_subscribed
                          ? 'Открыть'
                          : 'Подписаться'}
                    </button>
                  </div>
                );
              })}
            </>
          )}
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
      {previewChannelId && (
        <ChannelPreviewModal
          channelId={previewChannelId}
          onClose={() => setPreviewChannelId(null)}
          onOpenChannel={(channelId) => {
            setPreviewChannelId(null);
            void Promise.resolve(onRefresh()).then(() => onSelect(channelId));
          }}
          onSubscribed={async (channelId) => {
            setPreviewChannelId(null);
            await Promise.resolve(onRefresh());
            onSelect(channelId);
          }}
        />
      )}
    </aside>
  );
}
