'use client';

import { useEffect, useMemo, useState } from 'react';
import { ContactAvatar } from '@/components/ContactAvatar';
import { api } from '@/lib/api';

type Contact = {
  id: string;
  name: string;
  last_name: string;
  email?: string;
  avatar?: string | null;
};

export function CreateGroupModal({
  contacts,
  onClose,
  onCreated,
}: {
  contacts: Contact[];
  onClose: () => void;
  onCreated: (conversationId: number) => void;
}) {
  const [title, setTitle] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  const filteredContacts = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return contacts;
    return contacts.filter((c) => {
      const hay = `${c.name} ${c.last_name} ${c.email ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [contacts, filter]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.size === 0) {
      setError('Выберите участников');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api<{ conversation: { id: number } }>('/api/chat/groups', {
        method: 'POST',
        body: JSON.stringify({ title, member_ids: [...selected] }),
      });
      onCreated(res.conversation.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal modal--create-group" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="create-group-title">
        <header className="modal-card__head">
          <h2 id="create-group-title">Новая группа</h2>
          <button type="button" className="modal-close" aria-label="Закрыть" onClick={onClose}>
            ✕
          </button>
        </header>

        <form onSubmit={submit} className="modal-form modal-form--create-group">
          <label className="modal-field">
            <span>Название группы</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              placeholder="Например: Команда проекта"
            />
          </label>

          <label className="modal-field">
            <span>Участники ({selected.size} выбрано)</span>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Поиск по контактам…"
            />
          </label>

          {!contacts.length ? (
            <p className="modal-hint">Нет контактов для добавления</p>
          ) : !filteredContacts.length ? (
            <p className="modal-hint">Никого не найдено</p>
          ) : (
            <ul className="member-pick-list">
              {filteredContacts.map((c) => (
                <li key={c.id}>
                  <label className="member-pick">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                    <ContactAvatar
                      name={c.name}
                      lastName={c.last_name}
                      avatar={c.avatar}
                      size="sm"
                    />
                    <span className="member-pick__name">
                      {c.name} {c.last_name}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="auth-error">{error}</p>}

          <footer className="modal-card__foot">
            <button type="button" className="profile-btn profile-btn--outline" onClick={onClose}>
              Отмена
            </button>
            <button
              type="submit"
              className="profile-btn profile-btn--gold"
              disabled={loading || selected.size === 0 || title.trim().length < 2}
            >
              {loading ? 'Создание…' : 'Создать'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
