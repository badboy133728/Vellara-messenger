'use client';

import { useEffect, useMemo, useState } from 'react';
import { ContactAvatar } from '@/components/ContactAvatar';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import { storageDisplayUrl } from '@/lib/storage';
import type { ConversationListItem, FormattedMessage } from '@/lib/types';

function convTitle(c: ConversationListItem) {
  if (c.type === 'group') return c.title ?? 'Группа';
  if (c.other_user) return `${c.other_user.name} ${c.other_user.last_name}`.trim();
  return 'Чат';
}

function convAvatar(c: ConversationListItem): { type: 'image' | 'letter'; value: string } {
  if (c.type === 'group') {
    return { type: 'letter', value: (c.title?.[0] || 'G').toUpperCase() };
  }
  if (c.other_user?.avatar) {
    const url = storageDisplayUrl(c.other_user.avatar);
    if (url) return { type: 'image', value: url };
  }
  const letter =
    `${c.other_user?.name?.[0] || ''}${c.other_user?.last_name?.[0] || ''}`.toUpperCase() || '?';
  return { type: 'letter', value: letter };
}

function messagePreviewText(msg: FormattedMessage) {
  if (msg.is_deleted) return 'Сообщение удалено';
  if (msg.file_type === 'voice') return 'Голосовое сообщение';
  if (msg.file_type === 'image') return 'Фото';
  if (msg.file_type === 'document') return msg.file_original_name || 'Файл';
  const text = (msg.content || '').trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text || 'Сообщение';
}

export function ForwardDestinationModal({
  message,
  conversations,
  excludeConversationId,
  onClose,
  onForward,
}: {
  message: FormattedMessage;
  conversations: ConversationListItem[];
  excludeConversationId?: number | null;
  onClose: () => void;
  onForward: (conversationIds: number[], caption: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  const available = useMemo(() => {
    let list = conversations.filter((c) => !c.is_archived);
    if (excludeConversationId) {
      list = list.filter((c) => c.id !== excludeConversationId);
    }
    const q = filter.toLowerCase().trim();
    if (!q) return list;
    return list.filter((c) => convTitle(c).toLowerCase().includes(q));
  }, [conversations, excludeConversationId, filter]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected.size) {
      setError('Выберите хотя бы один чат');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onForward([...selected], caption.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось переслать');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal--create-group modal--forward"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="forward-title"
      >
        <header className="modal-card__head">
          <h2 id="forward-title">
            <VellaraIcon name="forward" size={20} className="modal-card__head-icon" />
            Переслать сообщение
          </h2>
          <button type="button" className="modal-close" aria-label="Закрыть" onClick={onClose}>
            <VellaraIcon name="close" size={18} />
          </button>
        </header>

        <form onSubmit={(e) => void submit(e)} className="modal-form modal-form--create-group">
          <div className="forward-preview">
            <span className="forward-preview__label">Сообщение</span>
            <p className="forward-preview__text">{messagePreviewText(message)}</p>
          </div>

          <label className="modal-field modal-field--compact">
            <span>Комментарий (необязательно)</span>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={2000}
              placeholder="Добавьте текст к пересылке…"
            />
          </label>

          <input
            className="search-input search-input--modal"
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Поиск по чатам…"
          />

          <div className="modal-member-list">
            {!available.length ? (
              <p className="modal-hint">Нет доступных чатов</p>
            ) : (
              available.map((c) => {
                const isSelected = selected.has(c.id);
                const avatar = convAvatar(c);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`conv-item conv-item--pick ${isSelected ? 'active' : ''}`}
                    onClick={() => toggle(c.id)}
                  >
                    {avatar.type === 'image' ? (
                      <img src={avatar.value} alt="" className="conv-avatar-img" />
                    ) : c.type === 'group' ? (
                      <span className="conv-avatar conv-avatar--group">{avatar.value}</span>
                    ) : (
                      <ContactAvatar
                        name={c.other_user?.name ?? ''}
                        lastName={c.other_user?.last_name ?? ''}
                        avatar={c.other_user?.avatar}
                        size="sm"
                      />
                    )}
                    <div className="conv-info">
                      <div className="conv-row">
                        <div className="conv-name">{convTitle(c)}</div>
                      </div>
                      {c.type === 'group' && (
                        <div className="conv-preview">{c.members_count ?? 0} участников</div>
                      )}
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
              disabled={loading || selected.size === 0}
            >
              {loading ? 'Пересылка…' : `Переслать${selected.size ? ` (${selected.size})` : ''}`}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
