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

type MemberTab = 'all' | 'selected';

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
  const [memberTab, setMemberTab] = useState<MemberTab>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  const filteredContacts = useMemo(() => {
    let list = contacts;
    if (memberTab === 'selected') {
      list = list.filter((c) => selected.has(c.id));
    }
    const q = filter.toLowerCase().trim();
    if (!q) return list;
    return list.filter((c) => {
      const hay = `${c.name} ${c.last_name} ${c.email ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [contacts, filter, memberTab, selected]);

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
      <div
        className="modal modal--create-group"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="create-group-title"
      >
        <header className="modal-card__head">
          <h2 id="create-group-title">
            <VellaraIcon name="contacts" size={20} className="modal-card__head-icon" />
            Новая группа
          </h2>
          <button type="button" className="modal-close" aria-label="Закрыть" onClick={onClose}>
            <VellaraIcon name="close" size={18} />
          </button>
        </header>

        <form onSubmit={submit} className="modal-form modal-form--create-group">
          <label className="modal-field modal-field--compact">
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

          <input
            className="search-input search-input--modal"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Поиск по контактам…"
          />

          <div className="tabs tabs--modal">
            <button
              type="button"
              className={memberTab === 'all' ? 'active' : ''}
              onClick={() => setMemberTab('all')}
            >
              Все
            </button>
            <button
              type="button"
              className={memberTab === 'selected' ? 'active' : ''}
              onClick={() => setMemberTab('selected')}
            >
              Выбранные
              {selected.size > 0 && <span className="badge">{selected.size}</span>}
            </button>
          </div>

          <div className="modal-member-list">
            {!contacts.length ? (
              <p className="modal-hint">Нет контактов для добавления</p>
            ) : !filteredContacts.length ? (
              <p className="modal-hint">{memberTab === 'selected' ? 'Никто не выбран' : 'Ничего не найдено'}</p>
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
                      <div className="conv-row">
                        <div className="conv-name">
                          {c.name} {c.last_name}
                        </div>
                      </div>
                      {c.email && <div className="conv-preview">{c.email}</div>}
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
