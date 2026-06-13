'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import { useSwipeDismiss, useSwipeGesture } from '@/hooks/useSwipeGesture';

export function ChannelSettingsModal({
  conversationId,
  onClose,
  onSaved,
}: {
  conversationId: number;
  onClose: () => void;
  onSaved?: (payload: { allow_comments: boolean; is_public: boolean }) => void;
}) {
  const [allowComments, setAllowComments] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
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
    api<{ allow_comments: boolean; is_public: boolean }>(`/api/chat/channels/${conversationId}`)
      .then((data) => {
        setAllowComments(!!data.allow_comments);
        setIsPublic(data.is_public !== false);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось загрузить'))
      .finally(() => setLoading(false));
  }, [conversationId]);

  const save = async (patch: { allow_comments?: boolean; is_public?: boolean }) => {
    setSaving(true);
    setError('');
    setSaved(false);
    const prevComments = allowComments;
    const prevIsPublic = isPublic;
    if (typeof patch.allow_comments === 'boolean') setAllowComments(patch.allow_comments);
    if (typeof patch.is_public === 'boolean') setIsPublic(patch.is_public);
    try {
      const data = await api<{ allow_comments: boolean; is_public: boolean }>(
        `/api/chat/channels/${conversationId}/settings`,
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
        },
      );
      const next = !!data.allow_comments;
      const nextPublic = data.is_public !== false;
      setAllowComments(next);
      setIsPublic(nextPublic);
      onSaved?.({ allow_comments: next, is_public: nextPublic });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setAllowComments(prevComments);
      setIsPublic(prevIsPublic);
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const sheetDismiss = useSwipeDismiss({ enabled: mounted, onDismiss: onClose });
  const sheetSwipe = useSwipeGesture({
    enabled: mounted,
    threshold: 64,
    onSwipeDown: onClose,
  });

  if (!mounted) return null;

  return createPortal(
    <div className="group-settings-backdrop" onClick={onClose} role="presentation">
      <div
        ref={sheetDismiss.bindRef}
        className="group-settings-card group-settings-card--channel"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          sheetDismiss.handlers.onTouchStart(e);
          sheetSwipe.onTouchStart(e);
        }}
        onTouchMove={(e) => {
          sheetDismiss.handlers.onTouchMove(e);
          sheetSwipe.onTouchMove(e);
        }}
        onTouchEnd={(e) => {
          sheetDismiss.handlers.onTouchEnd();
          sheetSwipe.onTouchEnd(e);
        }}
        onTouchCancel={() => {
          sheetDismiss.handlers.onTouchCancel();
          sheetSwipe.onTouchCancel();
        }}
        role="dialog"
        aria-labelledby="channel-settings-title"
      >
        <div className="group-settings-card__grab" aria-hidden="true" />
        <header className="group-settings-card__head">
          <h2 id="channel-settings-title">
            <VellaraIcon name="channel" size={18} className="group-settings-card__head-icon" />
            Настройки канала
          </h2>
          <button type="button" className="group-settings-close" aria-label="Закрыть" onClick={onClose}>
            <VellaraIcon name="close" size={18} />
          </button>
        </header>

        <div className="group-settings-card__body">
          {loading ? (
            <p className="group-settings-card__hint">Загрузка…</p>
          ) : (
            <>
              <p className="group-settings-card__intro">
                Управляйте видимостью канала и возможностью комментировать посты.
              </p>

              <label className="group-settings-toggle">
                <span className="group-settings-toggle__text">
                  <strong>Комментарии</strong>
                  <small>
                    {allowComments
                      ? 'Подписчики могут отвечать на посты канала'
                      : 'Только администратор публикует контент, без обсуждений'}
                  </small>
                </span>
                <span className="group-settings-toggle__switch">
                  <input
                    type="checkbox"
                    className="group-settings-toggle__input"
                    checked={allowComments}
                    disabled={saving}
                    onChange={(e) => void save({ allow_comments: e.target.checked })}
                  />
                  <span className="group-settings-toggle__track" aria-hidden="true" />
                </span>
              </label>

              <label className="group-settings-toggle">
                <span className="group-settings-toggle__text">
                  <strong>Публичный канал</strong>
                  <small>
                    {isPublic
                      ? 'Канал виден в общем поиске, любой может подписаться'
                      : 'Канал скрыт из поиска, только по приглашению администратора'}
                  </small>
                </span>
                <span className="group-settings-toggle__switch">
                  <input
                    type="checkbox"
                    className="group-settings-toggle__input"
                    checked={isPublic}
                    disabled={saving}
                    onChange={(e) => void save({ is_public: e.target.checked })}
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
          <button
            type="button"
            className="profile-btn profile-btn--channel profile-btn--full"
            onClick={onClose}
          >
            Готово
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
