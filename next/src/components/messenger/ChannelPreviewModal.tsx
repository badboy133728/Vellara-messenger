'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { effectiveMessageFileType } from '@/lib/chat/attachmentTypes';
import { displayMessageContent } from '@/lib/e2e/messageCrypto';
import type { FormattedMessage } from '@/lib/types';
import { VellaraIcon } from '@/components/icons/VellaraIcon';

type ChannelPreviewData = {
  id: number;
  title: string;
  description: string | null;
  members_count: number;
  is_subscribed: boolean;
  posts: FormattedMessage[];
};

function postBodyPreview(post: FormattedMessage) {
  const text = displayMessageContent(post).trim();
  const fileType = effectiveMessageFileType(post);
  const fileLabel =
    fileType === 'image'
      ? 'Фото'
      : fileType === 'video'
        ? 'Видео'
        : fileType === 'voice'
          ? 'Голосовое'
          : fileType === 'document'
            ? 'Файл'
            : '';
  if (text && fileLabel) return `${fileLabel} · ${text}`;
  if (text) return text;
  return fileLabel || 'Пост';
}

export function ChannelPreviewModal({
  channelId,
  onClose,
  onOpenChannel,
  onSubscribed,
}: {
  channelId: number;
  onClose: () => void;
  onOpenChannel: (channelId: number) => void;
  onSubscribed: (channelId: number) => Promise<void>;
}) {
  const [data, setData] = useState<ChannelPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api<ChannelPreviewData>(`/api/chat/channels/${channelId}/preview`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Не удалось загрузить предпросмотр');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const posts = useMemo(() => data?.posts ?? [], [data]);

  const handleSubscribe = async () => {
    if (!data) return;
    setSubscribing(true);
    try {
      await api(`/api/chat/channels/${data.id}/subscribe`, { method: 'POST' });
      await onSubscribed(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось подписаться');
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div className="channel-preview-backdrop" onClick={onClose} role="presentation">
      <aside
        className="channel-preview-modal"
        role="dialog"
        aria-label="Предпросмотр канала"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="channel-preview-modal__head">
          <h3>
            <VellaraIcon name="channel" size={16} />
            {data?.title ?? 'Канал'}
          </h3>
          <button type="button" className="channel-preview-modal__close" onClick={onClose}>
            <VellaraIcon name="close" size={18} />
          </button>
        </header>

        {loading ? (
          <p className="channel-preview-modal__empty">Загрузка предпросмотра…</p>
        ) : error ? (
          <p className="channel-preview-modal__empty">{error}</p>
        ) : data ? (
          <>
            <div className="channel-preview-modal__meta">
              <span>{data.members_count} подписчиков</span>
              <span>{posts.length} постов в превью</span>
            </div>
            {data.description?.trim() && (
              <p className="channel-preview-modal__description">{data.description}</p>
            )}
            {posts.length ? (
              <div className="channel-preview-posts">
                {posts.map((post) => (
                  <article key={post.id} className="channel-preview-post">
                    <header className="channel-preview-post__head">
                      <strong>
                        {post.sender?.name} {post.sender?.last_name}
                      </strong>
                      <time dateTime={post.created_at}>
                        {new Date(post.created_at).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </header>
                    <p className="channel-preview-post__body">{postBodyPreview(post)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="channel-preview-modal__empty">В канале пока нет постов</p>
            )}
            <div className="channel-preview-modal__actions">
              {data.is_subscribed ? (
                <button
                  type="button"
                  className="channel-preview-btn channel-preview-btn--open"
                  onClick={() => onOpenChannel(data.id)}
                >
                  Открыть канал
                </button>
              ) : (
                <button
                  type="button"
                  className="channel-preview-btn"
                  onClick={() => void handleSubscribe()}
                  disabled={subscribing}
                >
                  {subscribing ? 'Подписка…' : 'Подписаться'}
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="channel-preview-modal__empty">Канал не найден</p>
        )}
      </aside>
    </div>
  );
}
