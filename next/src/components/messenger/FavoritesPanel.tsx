'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EmojiPicker } from '@/components/EmojiPicker';
import { ImageLightbox } from '@/components/ImageLightbox';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import { api } from '@/lib/api';
import { prepareChatImageForUpload } from '@/lib/chatImageUpload';
import { publicStorageUrl } from '@/lib/storage';
import type { FormattedMessage } from '@/lib/types';

type SavedItem = {
  saved_at: string;
  is_own_note: boolean;
  message: FormattedMessage;
  source: {
    conversation_id: number;
    conversation_type: string;
    conversation_title: string | null;
  };
};

type PendingAttachment = {
  id: string;
  file: File;
  previewUrl: string | null;
  isImage: boolean;
};

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const FAV_FILE_INPUT_ID = 'favorites-attach-input';

function isImageAttachment(file: File) {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name);
}

export function FavoritesPanel({
  onForwardMessage,
  isMobile = false,
}: {
  onForwardMessage?: (message: FormattedMessage) => void;
  isMobile?: boolean;
}) {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; item: SavedItem } | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  const feedRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const attachmentUrlsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await api<{ data: SavedItem[] }>('/api/chat/messages/saved');
    setItems(res.data ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [items.length, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (composerRef.current?.contains(target)) return;
      if (emojiBtnRef.current?.contains(target)) return;
      setShowEmojiPicker(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [showEmojiPicker]);

  useEffect(() => {
    return () => {
      for (const url of attachmentUrlsRef.current) URL.revokeObjectURL(url);
      attachmentUrlsRef.current.clear();
    };
  }, []);

  const sourceLabel = (item: SavedItem) => {
    if (item.is_own_note) return 'Заметка';
    if (item.source.conversation_type === 'group') {
      return item.source.conversation_title || 'Группа';
    }
    const s = item.message.sender;
    return s ? `${s.name} ${s.last_name}`.trim() : 'Из чата';
  };

  const removeFromFavorites = async (item: SavedItem) => {
    setMenu(null);
    if (item.is_own_note) {
      await api(`/api/chat/messages/${item.message.id}`, { method: 'DELETE' });
    } else {
      await api(`/api/chat/messages/${item.message.id}/save`, { method: 'POST' });
    }
    setItems((prev) => prev.filter((i) => i.message.id !== item.message.id));
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  const revokeAttachmentUrl = (url: string | null) => {
    if (!url || !attachmentUrlsRef.current.has(url)) return;
    URL.revokeObjectURL(url);
    attachmentUrlsRef.current.delete(url);
  };

  const addAttachmentFile = (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      window.alert(`«${file.name}» больше 15 МБ`);
      return;
    }
    const isImage = isImageAttachment(file);
    const id = crypto.randomUUID();
    setPendingAttachments((prev) => [...prev, { id, file, isImage, previewUrl: null }]);
    if (isImage) {
      window.setTimeout(() => {
        const url = URL.createObjectURL(file);
        attachmentUrlsRef.current.add(url);
        setPendingAttachments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, previewUrl: url } : a)),
        );
      }, 0);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = '';
    for (const file of files) addAttachmentFile(file);
  };

  const clearAttachments = () => {
    for (const a of pendingAttachments) revokeAttachmentUrl(a.previewUrl);
    setPendingAttachments([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const item = prev.find((a) => a.id === id);
      revokeAttachmentUrl(item?.previewUrl ?? null);
      return prev.filter((a) => a.id !== id);
    });
  };

  const insertEmoji = (emoji: string) => {
    const input = textareaRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    window.setTimeout(() => {
      if (!input) return;
      const pos = start + emoji.length;
      input.focus();
      input.setSelectionRange(pos, pos);
    }, 0);
  };

  const toggleEmojiPicker = () => {
    setShowEmojiPicker((open) => {
      const next = !open;
      if (next && isMobile) textareaRef.current?.blur();
      else if (!next) window.setTimeout(() => textareaRef.current?.focus(), 0);
      return next;
    });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = text.trim();
    if (!content && !pendingAttachments.length) return;

    const files = pendingAttachments.map((a) => a.file);
    setSending(true);
    setText('');
    clearAttachments();
    setShowEmojiPicker(false);

    try {
      const form = new FormData();
      if (content) form.append('content', content);
      for (const file of files) {
        const uploadFile = await prepareChatImageForUpload(file);
        form.append('file', uploadFile);
      }

      const res = await api<{ messages: FormattedMessage[] }>('/api/chat/messages/saved', {
        method: 'POST',
        body: form,
        headers: {},
      });

      const now = new Date().toISOString();
      const newItems: SavedItem[] = (res.messages ?? []).map((message) => ({
        saved_at: message.created_at || now,
        is_own_note: true,
        message,
        source: {
          conversation_id: 0,
          conversation_type: 'saved',
          conversation_title: 'Избранное',
        },
      }));

      setItems((prev) => [...prev, ...newItems]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSending(false);
    }
  };

  const openImageLightbox = (m: FormattedMessage) => {
    const url = publicStorageUrl(m.file_path) ?? '';
    if (!url) return;
    let urls = [url];
    let index = 0;
    if (m.album_group_id) {
      urls = items
        .map((i) => i.message)
        .filter((x) => x.album_group_id === m.album_group_id && x.file_type === 'image')
        .map((x) => publicStorageUrl(x.file_path))
        .filter((u): u is string => !!u);
      index = Math.max(0, urls.indexOf(url));
    }
    setLightbox({ urls, index });
  };

  const renderMessageBody = (item: SavedItem) => {
    const m = item.message;
    if (m.is_deleted) {
      return <div className="msg-deleted">Сообщение удалено</div>;
    }

    const albumMessages =
      m.album_group_id && m.file_type === 'image'
        ? items
            .map((i) => i.message)
            .filter((x) => x.album_group_id === m.album_group_id && x.file_type === 'image')
        : [];
    const showAlbum = albumMessages.length > 1;
    const isAlbumAnchor =
      !showAlbum || albumMessages[0]?.id === m.id;

    if (showAlbum && !isAlbumAnchor) return null;

    return (
      <>
        {showAlbum ? (
          <div className={`fav-album-grid fav-album-grid--${Math.min(albumMessages.length, 4)}`}>
            {albumMessages.slice(0, 4).map((img, idx) => (
              <button
                key={img.id}
                type="button"
                className="msg-image-btn"
                onClick={() => openImageLightbox(m)}
              >
                <img src={publicStorageUrl(img.file_path) ?? ''} alt="Фото" loading="lazy" />
                {albumMessages.length > 4 && idx === 3 && (
                  <span className="fav-album-more">+{albumMessages.length - 4}</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          m.file_path &&
          m.file_type === 'image' && (
            <button
              type="button"
              className="msg-image-btn"
              onClick={() => openImageLightbox(m)}
            >
              <img src={publicStorageUrl(m.file_path) ?? ''} alt="Фото" loading="lazy" />
            </button>
          )
        )}
        {m.file_path && m.file_type === 'voice' && (
          <audio controls src={publicStorageUrl(m.file_path) ?? ''} />
        )}
        {m.file_path && m.file_type === 'document' && (
          <a
            href={publicStorageUrl(m.file_path) ?? '#'}
            className="msg-doc-link"
            target="_blank"
            rel="noreferrer"
          >
            <VellaraIcon name="document" size={16} className="msg-doc-link__icon" />
            {m.file_original_name || 'Файл'}
          </a>
        )}
        {m.content && <div className="msg-content">{m.content}</div>}
      </>
    );
  };

  const sortedItems = [...items].sort(
    (a, b) => new Date(a.saved_at).getTime() - new Date(b.saved_at).getTime(),
  );

  const seenAlbums = new Set<string>();
  const displayItems = sortedItems.filter((item) => {
    const m = item.message;
    if (m.album_group_id && m.file_type === 'image') {
      if (seenAlbums.has(m.album_group_id)) return false;
      seenAlbums.add(m.album_group_id);
    }
    return true;
  });

  return (
    <div className="favorites-page">
      <header className="favorites-page__head">
        <h1>Избранное</h1>
        <p className="favorites-page__sub">
          Заметки, фото и сохранённые сообщения из чатов
        </p>
      </header>

      <div className="favorites-feed" ref={feedRef}>
        {loading ? (
          <p className="favorites-page__hint">Загрузка…</p>
        ) : displayItems.length === 0 ? (
          <p className="favorites-page__hint">
            Пока пусто. Напишите заметку ниже или сохраните сообщение из чата через контекстное меню.
          </p>
        ) : (
          displayItems.map((item) => {
            const body = renderMessageBody(item);
            if (!body) return null;
            return (
              <div
                key={`${item.message.id}-${item.saved_at}`}
                className={`fav-row ${item.is_own_note ? 'fav-row--mine' : ''}`}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, item });
                }}
              >
                {!item.is_own_note && <p className="fav-source">{sourceLabel(item)}</p>}
                <div className={`message-bubble ${item.is_own_note ? 'my' : 'other'}`}>
                  {body}
                  <div className="msg-meta">
                    <span className="msg-time">{formatTime(item.saved_at)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div
        className={`favorites-composer${showEmojiPicker ? ' favorites-composer--emoji-open' : ''}`}
        ref={composerRef}
      >
        {showEmojiPicker && <EmojiPicker isMobile={isMobile} onSelect={insertEmoji} />}

        {pendingAttachments.length > 0 && (
          <div className="favorites-attachments">
            {pendingAttachments.map((att) => (
              <div key={att.id} className="favorites-attachment-item">
                {att.isImage && att.previewUrl ? (
                  <img src={att.previewUrl} alt="" className="favorites-attachment-thumb" />
                ) : (
                  <span className="favorites-attachment-doc">
                    <VellaraIcon name="document" size={16} />
                  </span>
                )}
                <button
                  type="button"
                  className="favorites-attachment-remove"
                  onClick={() => removeAttachment(att.id)}
                >
                  <VellaraIcon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          className="favorites-composer__form composer composer--telegram"
          onSubmit={(e) => void handleSubmit(e)}
        >
          <input
            id={FAV_FILE_INPUT_ID}
            ref={fileRef}
            type="file"
            className="composer-file-input"
            accept="image/*,.heic,.heif,.pdf,.doc,.docx,.webp"
            multiple
            onChange={handleFileSelect}
          />
          <label htmlFor={FAV_FILE_INPUT_ID} className="composer-btn composer-btn--attach" title="Прикрепить">
            <VellaraIcon name="attach" size={22} />
          </label>
          <div className="composer-field">
            <div className="composer-input-row">
              <div className="input-tools">
                <button
                  ref={emojiBtnRef}
                  type="button"
                  className={`composer-btn composer-btn--emoji ${showEmojiPicker ? 'composer-btn--active' : ''}`}
                  title="Смайлики"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleEmojiPicker();
                  }}
                >
                  <VellaraIcon name="smile" size={22} />
                </button>
              </div>
              <textarea
                ref={textareaRef}
                className="msg-input"
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onFocus={() => {
                  if (showEmojiPicker) setShowEmojiPicker(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder="Заметка, ссылка, фото…"
                maxLength={2000}
              />
            </div>
          </div>
          <button
            type="submit"
            className="composer-btn composer-btn--send"
            title="Сохранить"
            disabled={sending || (!text.trim() && !pendingAttachments.length)}
          >
            <VellaraIcon name="send" size={20} />
          </button>
        </form>
      </div>

      {menu && (
        <div
          className="msg-context-menu"
          style={{ top: menu.y, left: menu.x }}
          onClick={() => setMenu(null)}
        >
          {onForwardMessage && !menu.item.message.is_deleted && (
            <button
              type="button"
              className="msg-context-menu__item--with-icon"
              onClick={() => {
                onForwardMessage(menu.item.message);
                setMenu(null);
              }}
            >
              <VellaraIcon name="forward" size={16} />
              Переслать
            </button>
          )}
          <button type="button" onClick={() => void removeFromFavorites(menu.item)}>
            Убрать из избранного
          </button>
        </div>
      )}

      {lightbox && (
        <ImageLightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
