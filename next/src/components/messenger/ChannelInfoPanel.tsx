'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { ContactAvatar } from '@/components/ContactAvatar';
import { VellaraIcon } from '@/components/icons/VellaraIcon';

type ChannelMember = {
  id: string;
  name: string;
  last_name: string;
  avatar: string | null;
  role: string;
};

type ChannelDetail = {
  id: number;
  title: string | null;
  avatar: string | null;
  description: string | null;
  my_role: string;
  allow_comments: boolean;
  is_public: boolean;
  members: ChannelMember[];
};

type ContactRow = { id: string; name: string; last_name: string; avatar?: string | null };

export function ChannelInfoPanel({
  conversationId,
  currentUserId,
  onClose,
  onUpdated,
  onLeft,
  onDeleted,
}: {
  conversationId: number;
  currentUserId: string;
  onClose: () => void;
  onUpdated?: (payload?: { title?: string }) => void;
  onLeft?: () => void;
  onDeleted?: () => void;
}) {
  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [adding, setAdding] = useState(false);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ContactRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [transferringAdminId, setTransferringAdminId] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const searchTimerRef = useRef<number | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = channel?.my_role === 'admin';

  const memberIds = useMemo(
    () => new Set((channel?.members ?? []).map((m) => m.id)),
    [channel?.members],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<ChannelDetail>(`/api/chat/channels/${conversationId}`);
      setChannel(data);
      setEditTitle(data.title ?? '');
      setEditDescription(data.description ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<ContactRow[]>('/api/contacts/my')
      .then(setContacts)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = window.setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api<ContactRow[]>(
          `/api/chat/channels/${conversationId}/search-users?query=${encodeURIComponent(trimmed)}`,
        );
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    };
  }, [conversationId, searchQuery]);

  const togglePick = (id: string) => {
    setPickedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const saveMeta = async () => {
    if (!isAdmin) return;
    setSavingTitle(true);
    setError('');
    try {
      await api(`/api/chat/channels/${conversationId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim(),
        }),
      });
      setChannel((c) =>
        c ? { ...c, title: editTitle.trim(), description: editDescription.trim() || null } : c,
      );
      onUpdated?.({ title: editTitle.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSavingTitle(false);
    }
  };

  const addSubscribers = async () => {
    if (!pickedIds.length) return;
    setAdding(true);
    setError('');
    try {
      await api(`/api/chat/channels/${conversationId}/members`, {
        method: 'POST',
        body: JSON.stringify({ subscriber_ids: pickedIds }),
      });
      setPickedIds([]);
      setSearchQuery('');
      setSearchResults([]);
      await load();
      onUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setAdding(false);
    }
  };

  const removeSubscriber = async (userId: string) => {
    if (!window.confirm('Удалить подписчика?')) return;
    setError('');
    try {
      await api(`/api/chat/channels/${conversationId}/members/${userId}`, { method: 'DELETE' });
      await load();
      onUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const transferAdmin = async (targetUserId: string) => {
    if (!window.confirm('Передать права администратора этому пользователю?')) return;
    setError('');
    setTransferringAdminId(targetUserId);
    try {
      await api(`/api/chat/channels/${conversationId}/transfer-admin`, {
        method: 'POST',
        body: JSON.stringify({ target_user_id: targetUserId }),
      });
      await load();
      onUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setTransferringAdminId(null);
    }
  };

  const leaveChannel = async () => {
    if (!window.confirm('Отписаться от канала?')) return;
    setError('');
    try {
      await api(`/api/chat/channels/${conversationId}/members/${currentUserId}`, {
        method: 'DELETE',
      });
      onLeft?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const uploadAvatar = async (file: File) => {
    setAvatarUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.set('avatar', file);
      await api(`/api/chat/channels/${conversationId}`, {
        method: 'PATCH',
        body: formData,
      });
      await load();
      onUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const clearAvatar = async () => {
    setAvatarUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.set('clear_avatar', '1');
      await api(`/api/chat/channels/${conversationId}`, {
        method: 'PATCH',
        body: formData,
      });
      await load();
      onUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setAvatarUploading(false);
    }
  };

  const deleteChannel = async () => {
    if (
      !window.confirm(
        'Удалить канал безвозвратно? Все подписчики потеряют доступ, посты и комментарии будут удалены.',
      )
    ) {
      return;
    }
    setError('');
    try {
      await api(`/api/chat/channels/${conversationId}`, { method: 'DELETE' });
      onDeleted?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const pickList =
    searchQuery.trim().length >= 2
      ? searchResults
      : contacts.filter((c) => !memberIds.has(c.id));

  return (
    <div className="group-panel-backdrop" onClick={onClose} role="presentation">
      <aside
        className="group-panel group-panel--channel"
        role="dialog"
        aria-label="Информация о канале"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="group-panel__head">
          <h2>
            <VellaraIcon name="channel" size={18} className="group-panel__head-icon" />
            {channel?.title || 'Канал'}
          </h2>
          <button type="button" className="group-settings-close" aria-label="Закрыть" onClick={onClose}>
            <VellaraIcon name="close" size={18} />
          </button>
        </header>

        <div className="group-panel__scroll">
          {loading ? (
            <p className="group-panel__hint">Загрузка…</p>
          ) : channel ? (
            <>
              {channel.description && !isAdmin && (
                <p className="group-panel__description">{channel.description}</p>
              )}

              {isAdmin && (
                <div className="group-panel__section">
                  <h3>Аватар канала</h3>
                  <div className="group-panel__avatar-editor">
                    <ContactAvatar
                      name={channel.title || 'Канал'}
                      lastName=""
                      avatar={channel.avatar}
                      size="lg"
                    />
                    <div className="group-panel__avatar-actions">
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="composer-file-input"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadAvatar(file);
                        }}
                      />
                      <button
                        type="button"
                        className="profile-btn profile-btn--outline"
                        disabled={avatarUploading}
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        {avatarUploading ? 'Загрузка…' : 'Изменить фото'}
                      </button>
                      {!!channel.avatar && (
                        <button
                          type="button"
                          className="profile-btn profile-btn--outline"
                          disabled={avatarUploading}
                          onClick={() => void clearAvatar()}
                        >
                          Удалить фото
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {isAdmin && (
                <div className="group-panel__section">
                  <label className="group-panel__field">
                    <span>Название</span>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      type="text"
                      className="profile-field"
                      maxLength={100}
                    />
                  </label>
                  <label className="group-panel__field">
                    <span>Описание</span>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="profile-field"
                      rows={3}
                      maxLength={500}
                    />
                  </label>
                  <button
                    type="button"
                    className="profile-btn profile-btn--gold profile-btn--full"
                    disabled={savingTitle}
                    onClick={saveMeta}
                  >
                    Сохранить
                  </button>
                </div>
              )}

              <div className="group-panel__section">
                <h3>
                  Подписчики ({channel.members?.length || 0})
                  {channel.allow_comments && (
                    <span className="group-panel__badge">комментарии включены</span>
                  )}
                  <span className="group-panel__badge">
                    {channel.is_public ? 'публичный' : 'приватный'}
                  </span>
                </h3>
                <ul className="group-members">
                  {channel.members.map((m) => (
                    <li key={m.id} className="group-member">
                      <ContactAvatar
                        name={m.name}
                        lastName={m.last_name}
                        avatar={m.avatar}
                        size="sm"
                      />
                      <div className="group-member__info">
                        <strong>
                          {m.name} {m.last_name}
                        </strong>
                        <span className="group-member__role">
                          {m.role === 'admin' ? 'Администратор' : 'Подписчик'}
                        </span>
                      </div>
                      {isAdmin && m.id !== currentUserId && (
                        <div className="group-member__actions">
                          {m.role !== 'admin' && (
                            <button
                              type="button"
                              className="group-member__btn group-member__btn--promote"
                              title="Передать права администратора"
                              disabled={transferringAdminId === m.id}
                              onClick={() => void transferAdmin(m.id)}
                            >
                              <VellaraIcon name="star" size={15} />
                            </button>
                          )}
                          {m.role !== 'admin' && (
                            <button
                              type="button"
                              className="group-member__btn"
                              title="Удалить подписчика"
                              onClick={() => removeSubscriber(m.id)}
                            >
                              <VellaraIcon name="close" size={16} />
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {isAdmin && (
                <div className="group-panel__section">
                  <h3>Добавить подписчиков</h3>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    type="search"
                    className="profile-field"
                    placeholder="Поиск по имени или email…"
                  />
                  {searching && <p className="group-panel__hint">Поиск…</p>}
                  <ul className="group-members group-members--pick">
                    {pickList.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={`group-member group-member--pick ${pickedIds.includes(c.id) ? 'active' : ''}`}
                          onClick={() => togglePick(c.id)}
                        >
                          <ContactAvatar
                            name={c.name}
                            lastName={c.last_name}
                            avatar={c.avatar}
                            size="sm"
                          />
                          <span>
                            {c.name} {c.last_name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="profile-btn profile-btn--gold profile-btn--full"
                    disabled={adding || !pickedIds.length}
                    onClick={addSubscribers}
                  >
                    {adding ? 'Добавление…' : `Добавить (${pickedIds.length})`}
                  </button>
                </div>
              )}

              {!isAdmin && (
                <div className="group-panel__section group-panel__leave">
                  <button
                    type="button"
                    className="profile-btn profile-btn--outline profile-btn--full"
                    onClick={leaveChannel}
                  >
                    Отписаться
                  </button>
                </div>
              )}

              {isAdmin && (
                <div className="group-panel__section group-panel__leave">
                  <button
                    type="button"
                    className="profile-btn profile-btn--danger profile-btn--full"
                    onClick={deleteChannel}
                  >
                    Удалить канал
                  </button>
                  <p className="group-panel__hint-sm">
                    Канал и все сообщения будут удалены у всех подписчиков.
                  </p>
                </div>
              )}

              {error && <p className="auth-error modal-error">{error}</p>}
            </>
          ) : (
            <p className="group-panel__hint">{error || 'Канал не найден'}</p>
          )}
        </div>
      </aside>
    </div>
  );
}
