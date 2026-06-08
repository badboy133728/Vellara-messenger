'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';

export function GroupSettingsModal({
  conversationId,
  onClose,
  onSaved,
}: {
  conversationId: number;
  onClose: () => void;
  onSaved?: (payload: { allow_voice_messages: boolean }) => void;
}) {
  const [allowVoice, setAllowVoice] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    api<{ allow_voice_messages: boolean }>(`/api/chat/groups/${conversationId}`)
      .then((data) => setAllowVoice(data.allow_voice_messages !== false))
      .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось загрузить настройки'))
      .finally(() => setLoading(false));
  }, [conversationId]);

  const save = async (value: boolean) => {
    setSaving(true);
    setError('');
    setSaved(false);
    const prev = allowVoice;
    setAllowVoice(value);
    try {
      const data = await api<{ allow_voice_messages: boolean }>(
        `/api/chat/groups/${conversationId}/settings`,
        {
          method: 'PATCH',
          body: JSON.stringify({ allow_voice_messages: value }),
        },
      );
      const next = data.allow_voice_messages !== false;
      setAllowVoice(next);
      setSaved(true);
      onSaved?.({ allow_voice_messages: next });
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setAllowVoice(prev);
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="group-settings-backdrop" onClick={onClose} role="presentation">
      <div
        className="group-settings-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="group-settings-title"
      >
        <header className="group-settings-card__head">
          <h2 id="group-settings-title">Настройки группы</h2>
          <button type="button" className="group-settings-close" aria-label="Закрыть" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="group-settings-card__body">
          {loading ? (
            <p className="group-settings-card__hint">Загрузка…</p>
          ) : (
            <>
              <label className="group-settings-toggle">
                <span className="group-settings-toggle__text">
                  <strong>Голосовые сообщения</strong>
                  <small>
                    {allowVoice
                      ? 'Участники могут отправлять голосовые'
                      : 'Только администраторы могут отправлять голосовые'}
                  </small>
                </span>
                <span className="group-settings-toggle__switch">
                  <input
                    type="checkbox"
                    className="group-settings-toggle__input"
                    checked={allowVoice}
                    disabled={saving}
                    onChange={(e) => save(e.target.checked)}
                  />
                  <span className="group-settings-toggle__track" aria-hidden="true" />
                </span>
              </label>

              {error && <p className="profile-alert profile-alert--error">{error}</p>}
              {saved && <p className="profile-alert profile-alert--success">Сохранено</p>}
            </>
          )}
        </div>

        <footer className="group-settings-card__foot">
          <button type="button" className="profile-btn profile-btn--gold profile-btn--full" onClick={onClose}>
            Готово
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
