'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { ContactAvatar } from '@/components/ContactAvatar';

type GroupMember = {
  id: string;
  name: string;
  last_name: string;
  avatar: string | null;
  role: string;
};

type GroupDetail = {
  id: number;
  title: string | null;
  my_role: string;
  members: GroupMember[];
};

type ContactRow = { id: string; name: string; last_name: string; avatar?: string | null };

export function GroupInfoPanel({
  conversationId,
  currentUserId,
  onClose,
  onUpdated,
  onLeft,
}: {
  conversationId: number;
  currentUserId: string;
  onClose: () => void;
  onUpdated?: (payload?: { title?: string; members?: GroupMember[] }) => void;
  onLeft?: () => void;
}) {
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editTitle, setEditTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [adding, setAdding] = useState(false);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ContactRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const searchTimerRef = useRef<number | null>(null);

  const isAdmin = group?.my_role === 'admin';

  const memberIds = useMemo(
    () => new Set((group?.members ?? []).map((m) => m.id)),
    [group?.members],
  );

  const availableContacts = useMemo(
    () => contacts.filter((c) => !memberIds.has(c.id)),
    [contacts, memberIds],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<GroupDetail>(`/api/chat/groups/${conversationId}`);
      setGroup(data);
      setEditTitle(data.title ?? '');
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
          `/api/chat/groups/${conversationId}/search-users?query=${encodeURIComponent(trimmed)}`,
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

  const saveTitle = async () => {
    if (!isAdmin) return;
    setSavingTitle(true);
    setError('');
    try {
      await api(`/api/chat/groups/${conversationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      setGroup((g) => (g ? { ...g, title: editTitle.trim() } : g));
      onUpdated?.({ title: editTitle.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSavingTitle(false);
    }
  };

  const addMembers = async () => {
    if (!pickedIds.length) return;
    setAdding(true);
    setError('');
    try {
      await api(`/api/chat/groups/${conversationId}/members`, {
        method: 'POST',
        body: JSON.stringify({ member_ids: pickedIds }),
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

  const setRole = async (userId: string, role: 'admin' | 'member') => {
    const label = role === 'admin' ? 'назначить администратором' : 'снять права администратора';
    if (!window.confirm(`Вы уверены, что хотите ${label} этого участника?`)) return;
    setRoleBusy(userId);
    setError('');
    try {
      await api(`/api/chat/groups/${conversationId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      await load();
      onUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setRoleBusy(null);
    }
  };

  const removeMember = async (userId: string) => {
    if (!window.confirm('Удалить участника из группы?')) return;
    setError('');
    try {
      await api(`/api/chat/groups/${conversationId}/members/${userId}`, { method: 'DELETE' });
      await load();
      onUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const leaveGroup = async () => {
    if (!window.confirm('Выйти из группы?')) return;
    setError('');
    try {
      await api(`/api/chat/groups/${conversationId}/members/${currentUserId}`, { method: 'DELETE' });
      onLeft?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  return (
    <div className="group-panel-backdrop" onClick={onClose} role="presentation">
      <aside
        className="group-panel"
        role="dialog"
        aria-label="Информация о группе"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="group-panel__head">
          <h2>{group?.title || 'Группа'}</h2>
          <button type="button" className="group-settings-close" aria-label="Закрыть" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="group-panel__scroll">
        {loading ? (
          <p className="group-panel__hint">Загрузка…</p>
        ) : group ? (
          <>
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
                <button
                  type="button"
                  className="profile-btn profile-btn--gold profile-btn--full"
                  disabled={savingTitle}
                  onClick={saveTitle}
                >
                  Сохранить название
                </button>
              </div>
            )}

            <div className="group-panel__section">
              <h3>Участники ({group.members?.length || 0})</h3>
              <ul className="group-members">
                {group.members.map((m) => (
                  <li key={m.id} className="group-member">
                    <ContactAvatar name={m.name} lastName={m.last_name} avatar={m.avatar} size="sm" />
                    <div className="group-member__info">
                      <strong>
                        {m.name} {m.last_name}
                      </strong>
                      <span className="group-member__role">{m.role === 'admin' ? 'Админ' : 'Участник'}</span>
                    </div>
                    {isAdmin && m.id !== currentUserId && (
                      <div className="group-member__actions">
                        {m.role !== 'admin' ? (
                          <button
                            type="button"
                            className="group-member__btn"
                            title="Сделать администратором"
                            disabled={roleBusy === m.id}
                            onClick={() => setRole(m.id, 'admin')}
                          >
                            ↑
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="group-member__btn"
                            title="Снять права администратора"
                            disabled={roleBusy === m.id}
                            onClick={() => setRole(m.id, 'member')}
                          >
                            ↓
                          </button>
                        )}
                        <button
                          type="button"
                          className="group-member__btn"
                          title="Удалить"
                          onClick={() => removeMember(m.id)}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {isAdmin && (
              <div className="group-panel__section">
                <h3>Добавить участников</h3>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  type="search"
                  className="profile-field"
                  placeholder="Поиск по имени или email (от 2 символов)…"
                  autoComplete="off"
                />

                {searchResults.length > 0 && (
                  <ul className="group-search-results">
                    {searchResults.map((u) => (
                      <li key={u.id}>
                        <label className="group-search-item">
                          <input
                            type="checkbox"
                            checked={pickedIds.includes(u.id)}
                            onChange={() => togglePick(u.id)}
                          />
                          <ContactAvatar name={u.name} lastName={u.last_name} avatar={u.avatar} size="sm" />
                          <span>
                            {u.name} {u.last_name}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
                  <p className="group-panel__hint-sm">Никого не найдено</p>
                )}

                {availableContacts.length > 0 && (
                  <div className="group-contacts-quick">
                    <p className="group-panel__hint-sm">Из контактов:</p>
                    <div className="group-contacts-chips">
                      {availableContacts.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`group-chip ${pickedIds.includes(c.id) ? 'group-chip--active' : ''}`}
                          onClick={() => togglePick(c.id)}
                        >
                          {c.name} {c.last_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {pickedIds.length > 0 && (
                  <p className="group-picked-count">Выбрано: {pickedIds.length}</p>
                )}

                <button
                  type="button"
                  className="profile-btn profile-btn--gold profile-btn--full"
                  disabled={!pickedIds.length || adding}
                  onClick={addMembers}
                >
                  {adding ? 'Добавление…' : 'Добавить в группу'}
                </button>
              </div>
            )}

            <div className="group-panel__section group-panel__leave">
              <button
                type="button"
                className="profile-btn profile-btn--outline profile-btn--full"
                onClick={leaveGroup}
              >
                Выйти из группы
              </button>
            </div>
          </>
        ) : null}

        {error && <p className="profile-alert profile-alert--error group-panel__error">{error}</p>}
        </div>
      </aside>
    </div>
  );
}
