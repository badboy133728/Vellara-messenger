'use client';

import { useEffect, useMemo, useState } from 'react';
import { ContactAvatar } from '@/components/ContactAvatar';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import { api } from '@/lib/api';

type Contact = {
  id: string;
  name: string;
  last_name: string;
  email?: string;
  avatar?: string | null;
};

export function CreateChannelModal({
  contacts,
  onClose,
  onCreated,
}: {
  contacts: Contact[];
  onClose: () => void;
  onCreated: (conversationId: number) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [allowComments, setAllowComments] = useState(false);
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
    if (title.trim().length < 2) {
      setError('Название 2–100 символов');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api<{ conversation: { id: number } }>('/api/chat/channels', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          allow_comments: allowComments,
          subscriber_ids: [...selected],
        }),
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
      <div
        className="modal modal--create-group modal--channel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="create-channel-title"
      >
        <header className="modal-card__head">
          <h2 id="create-channel-title">
            <VellaraIcon name="channel" size={20} className="modal-card__head-icon" />
            Новый канал
          </h2>
          <button type="button" className="modal-close" aria-label="Закрыть" onClick={onClose}>
            <VellaraIcon name="close" size={18} />
          </button>
        </header>

        <form onSubmit={(e) => void submit(e)} className="modal-form modal-form--create-group">
          <label className="modal-field">
            <span>Название канала</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="Например: Новости Vellara"
              autoFocus
            />
          </label>

          <label className="modal-field">
            <span>Описание (необязательно)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="О чём этот канал"
            />
          </label>

          <label className="modal-field modal-field--checkbox">
            <input
              type="checkbox"
              checked={allowComments}
              onChange={(e) => setAllowComments(e.target.checked)}
            />
            <span>Разрешить комментарии к постам</span>
          </label>

          <p className="modal-hint">
            Вы — администратор канала и единственный, кто может публиковать посты. Подписчики
            смогут только читать{allowComments ? ' и комментировать посты' : ''}.
          </p>

          <input
            className="search-input search-input--modal"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Добавить подписчиков из контактов…"
          />

          <div className="modal-member-list">
            {!filteredContacts.length ? (
              <p className="modal-hint">Нет контактов для добавления</p>
            ) : (
              filteredContacts.map((c) => {
                const isSelected = selected.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`conv-item conv-item--pick ${isSelected ? 'active' : ''}`}
                    onClick={() => toggle(c.id)}
                  >
                    <ContactAvatar
                      name={c.name}
                      lastName={c.last_name}
                      avatar={c.avatar}
                      size="sm"
                    />
                    <div className="conv-info">
                      <div className="conv-name">
                        {c.name} {c.last_name}
                      </div>
                    </div>
                    {isSelected && (
                      <span className="conv-pick-check" aria-hidden="true">
                        <VellaraIcon name="check" size={16} />
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {error && <p className="auth-error modal-error">{error}</p>}

          <footer className="modal-card__foot">
            <button type="button" className="profile-btn profile-btn--outline" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="profile-btn profile-btn--gold" disabled={loading}>
              {loading ? 'Создание…' : 'Создать канал'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
