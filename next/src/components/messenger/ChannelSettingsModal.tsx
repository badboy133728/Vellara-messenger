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
        className="group-settings-sheet"
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
        <div className="group-settings-sheet__handle" aria-hidden="true" />
        <header className="group-settings-sheet__head">
          <h2 id="channel-settings-title">Настройки канала</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            <VellaraIcon name="close" size={18} />
          </button>
        </header>

        {loading ? (
          <p className="modal-hint">Загрузка…</p>
        ) : (
          <div className="group-settings-sheet__body">
            <label className="group-settings-toggle">
              <div>
                <strong>Комментарии</strong>
                <p className="modal-hint">Подписчики смогут отвечать на посты канала</p>
              </div>
              <input
                type="checkbox"
                checked={allowComments}
                disabled={saving}
                onChange={(e) => void save({ allow_comments: e.target.checked })}
              />
            </label>
            <label className="group-settings-toggle">
              <div>
                <strong>Публичный канал</strong>
                <p className="modal-hint">
                  Публичные каналы видны в общем поиске, приватные — только по приглашению администратора
                </p>
              </div>
              <input
                type="checkbox"
                checked={isPublic}
                disabled={saving}
                onChange={(e) => void save({ is_public: e.target.checked })}
              />
            </label>
            {error && <p className="auth-error modal-error">{error}</p>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
