'use client';

import { useCallback, useEffect, useState } from 'react';
import { ImageLightbox } from '@/components/ImageLightbox';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import { api } from '@/lib/api';
import { publicStorageUrl } from '@/lib/storage';
import type { FormattedMessage } from '@/lib/types';

type SavedItem = {
  saved_at: string;
  message: FormattedMessage;
  source: {
    conversation_id: number;
    conversation_type: string;
    conversation_title: string | null;
  };
};

export function FavoritesPanel() {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState<{ x: number; y: number; messageId: number } | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ data: SavedItem[] }>('/api/chat/messages/saved');
    setItems(res.data ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [load]);

  const sourceLabel = (item: SavedItem) => {
    if (item.source.conversation_type === 'group') {
      return item.source.conversation_title || 'Группа';
    }
    const s = item.message.sender;
    return s ? `${s.name} ${s.last_name}`.trim() : 'Личный чат';
  };

  const unsave = async (messageId: number) => {
    setMenu(null);
    await api(`/api/chat/messages/${messageId}/save`, { method: 'POST' });
    setItems((prev) => prev.filter((i) => i.message.id !== messageId));
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="favorites-page">
      <header className="favorites-page__head">
        <h1>Избранное</h1>
        <p className="favorites-page__sub">Сохранённые сообщения из любых чатов</p>
      </header>

      {loading ? (
        <p className="favorites-page__hint">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="favorites-page__hint">
          Пока пусто. Нажмите «Сохранить в избранное» в контекстном меню сообщения.
        </p>
      ) : (
        <div className="favorites-feed">
          {items.map((item) => (
            <div
              key={`${item.message.id}-${item.saved_at}`}
              className="fav-row"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, messageId: item.message.id });
              }}
            >
              <p className="fav-source">{sourceLabel(item)}</p>
              <div className="message-bubble other">
                {item.message.is_deleted ? (
                  <div className="msg-deleted">Сообщение удалено</div>
                ) : (
                  <>
                    {item.message.file_path && item.message.file_type === 'image' && (
                      <button
                        type="button"
                        className="msg-image-btn"
                        onClick={() => {
                          const url = publicStorageUrl(item.message.file_path) ?? '';
                          if (url) setLightbox({ urls: [url], index: 0 });
                        }}
                      >
                        <img src={publicStorageUrl(item.message.file_path) ?? ''} alt="Фото" loading="lazy" />
                      </button>
                    )}
                    {item.message.file_path && item.message.file_type === 'voice' && (
                      <audio controls src={publicStorageUrl(item.message.file_path) ?? ''} />
                    )}
                    {item.message.file_path && item.message.file_type === 'document' && (
                      <a
                        href={publicStorageUrl(item.message.file_path) ?? '#'}
                        className="msg-doc-link"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <VellaraIcon name="document" size={16} className="msg-doc-link__icon" />
                        {item.message.file_original_name || 'Файл'}
                      </a>
                    )}
                    {item.message.content && (
                      <div className="msg-content">{item.message.content}</div>
                    )}
                  </>
                )}
                <div className="msg-meta">
                  <span className="msg-time">{formatTime(item.saved_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {menu && (
        <div
          className="msg-context-menu"
          style={{ top: menu.y, left: menu.x }}
          onClick={() => setMenu(null)}
        >
          <button type="button" onClick={() => unsave(menu.messageId)}>
            Убрать из избранного
          </button>
        </div>
      )}

      {lightbox && (
        <ImageLightbox
          urls={lightbox.urls}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
