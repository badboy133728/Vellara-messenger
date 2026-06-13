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
  const [isPublic, setIsPublic] = useState(true);
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
          is_public: isPublic,
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
        <header className="modal-card__head modal-card__head--channel">
          <h2 id="create-channel-title">
            <VellaraIcon name="channel" size={20} className="modal-card__head-icon" />
            Новый канал
          </h2>
          <button type="button" className="modal-close" aria-label="Закрыть" onClick={onClose}>
            <VellaraIcon name="close" size={18} />
          </button>
        </header>

        <form onSubmit={(e) => void submit(e)} className="modal-form modal-form--create-group modal-form--channel">
          <div className="channel-create-scroll">
            <section className="channel-create-section">
              <h3 className="channel-create-section__title">Основное</h3>
              <label className="modal-field modal-field--compact">
                <span>Название канала</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  placeholder="Например: Новости Vellara"
                  autoFocus
                />
              </label>
              <label className="modal-field modal-field--compact">
                <span>Описание</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="О чём этот канал — увидят подписчики в профиле канала"
                />
              </label>
            </section>

            <section className="channel-create-section">
              <h3 className="channel-create-section__title">Настройки</h3>
              <div className="channel-create-toggles">
                <label className="group-settings-toggle">
                  <span className="group-settings-toggle__text">
                    <strong>Комментарии к постам</strong>
                    <small>Подписчики смогут обсуждать публикации</small>
                  </span>
                  <span className="group-settings-toggle__switch">
                    <input
                      type="checkbox"
                      className="group-settings-toggle__input"
                      checked={allowComments}
                      onChange={(e) => setAllowComments(e.target.checked)}
                    />
                    <span className="group-settings-toggle__track" aria-hidden="true" />
                  </span>
                </label>
                <label className="group-settings-toggle">
                  <span className="group-settings-toggle__text">
                    <strong>Публичный канал</strong>
                    <small>Будет виден в общем поиске по каналам</small>
                  </span>
                  <span className="group-settings-toggle__switch">
                    <input
                      type="checkbox"
                      className="group-settings-toggle__input"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                    />
                    <span className="group-settings-toggle__track" aria-hidden="true" />
                  </span>
                </label>
              </div>
              <div className="channel-create-callout">
                <VellaraIcon name="channel" size={16} className="channel-create-callout__icon" />
                <p>
                  Вы станете администратором и единственным автором постов. Подписчики смогут только
                  читать{allowComments ? ' и комментировать' : ''}.
                </p>
              </div>
            </section>

            <section className="channel-create-section channel-create-section--members">
              <div className="channel-create-section__row">
                <h3 className="channel-create-section__title">Подписчики</h3>
                {selected.size > 0 && <span className="channel-create-badge">{selected.size}</span>}
              </div>
              <p className="channel-create-section__hint">Необязательно — можно добавить позже</p>
              <input
                className="search-input search-input--modal search-input--channel"
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Поиск по контактам…"
              />
              <div className="modal-member-list modal-member-list--channel">
                {!filteredContacts.length ? (
                  <p className="modal-hint modal-hint--inline">
                    {contacts.length ? 'Ничего не найдено' : 'Нет контактов для добавления'}
                  </p>
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
                          {c.email && <div className="conv-preview">{c.email}</div>}
                        </div>
                        {isSelected && (
                          <span className="conv-pick-check conv-pick-check--channel" aria-hidden="true">
                            <VellaraIcon name="check" size={16} />
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            {error && <p className="auth-error modal-error">{error}</p>}
          </div>

          <footer className="modal-card__foot modal-card__foot--channel">
            <button type="button" className="profile-btn profile-btn--outline" onClick={onClose}>
              Отмена
            </button>
            <button
              type="submit"
              className="profile-btn profile-btn--channel"
              disabled={loading || title.trim().length < 2}
            >
              {loading ? 'Создание…' : 'Создать канал'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
