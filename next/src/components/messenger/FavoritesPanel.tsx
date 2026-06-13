'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EmojiPicker } from '@/components/EmojiPicker';
import { ImageLightbox } from '@/components/ImageLightbox';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import {
  effectiveMessageFileType,
  isImageAttachment,
  isVideoAttachment,
  maxBytesForFile,
  mimeHintForMessageFile,
} from '@/lib/chat/attachmentTypes';
import { prepareMessageFileForSend, type PreparedMessageFile } from '@/lib/chat/messageFileUpload';
import { storageDisplayUrl } from '@/lib/storage';
import type { ConversationListItem, FormattedMessage } from '@/lib/types';
import {
  buildE2EContextFromConversation,
  decryptMessagesForConversation,
  displayFileName,
  displayMessageContent,
  resolveDecryptedMediaUrl,
} from '@/lib/e2e/messageCrypto';
import type { ConversationKeyContext } from '@/lib/crypto/conversationKey';
import { useDecryptedFileUrl } from '@/hooks/useDecryptedFileUrl';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';

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

const FAV_FILE_INPUT_ID = 'favorites-attach-input';

type GroupDetailResponse = {
  members: Array<{ id: string }>;
};

function FavoriteImageThumb({
  message,
  userId,
  e2eContext,
  onClick,
  moreCount,
}: {
  message: FormattedMessage;
  userId: string;
  e2eContext: ConversationKeyContext | null;
  onClick: () => void;
  moreCount?: number;
}) {
  const src = useDecryptedFileUrl(
    userId,
    e2eContext,
    message.file_path,
    message.file_original_name,
    mimeHintForMessageFile(message) ?? 'image/jpeg',
  );
  if (!src) return null;
  return (
    <button type="button" className="msg-image-btn" onClick={onClick}>
      <img src={src} alt="Фото" loading="lazy" />
      {!!moreCount && <span className="fav-album-more">+{moreCount}</span>}
    </button>
  );
}

function FavoriteNonImageAttachment({
  message,
  userId,
  e2eContext,
}: {
  message: FormattedMessage;
  userId: string;
  e2eContext: ConversationKeyContext | null;
}) {
  const fileType = effectiveMessageFileType(message);
  const src = useDecryptedFileUrl(
    userId,
    e2eContext,
    message.file_path,
    message.file_original_name,
    mimeHintForMessageFile(message),
  );
  if (!src || !message.file_path || !fileType || fileType === 'image') return null;

  if (fileType === 'video') {
    return (
      <div className="msg-video-wrap">
        <video className="msg-video" src={src} controls playsInline preload="metadata" />
      </div>
    );
  }
  if (fileType === 'voice') {
    return <VoiceMessagePlayer src={src} duration={message.voice_duration || 0} />;
  }
  return (
    <a
      href={src}
      className="msg-doc-link"
      target="_blank"
      rel="noreferrer"
      download={displayFileName(message) || 'file'}
    >
      <VellaraIcon name="document" size={16} className="msg-doc-link__icon" />
      {displayFileName(message) || 'Файл'}
    </a>
  );
}

export function FavoritesPanel({
  onForwardMessage,
  isMobile = false,
}: {
  onForwardMessage?: (message: FormattedMessage) => void;
  isMobile?: boolean;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; item: SavedItem } | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [e2eContextsByConversation, setE2eContextsByConversation] = useState<
    Record<number, ConversationKeyContext>
  >({});

  const feedRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const emojiCaretRef = useRef<number | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const attachmentUrlsRef = useRef<Set<string>>(new Set());

  const resolveE2EContexts = useCallback(
    async (rawItems: SavedItem[]) => {
      if (!user) return {} as Record<number, ConversationKeyContext>;

      const convIds = [
        ...new Set(
          rawItems
            .filter((item) => !item.is_own_note && item.source.conversation_id > 0)
            .map((item) => item.source.conversation_id),
        ),
      ];
      if (!convIds.length) return {} as Record<number, ConversationKeyContext>;

      const conversations = await api<ConversationListItem[]>('/api/chat').catch(() => []);
      const convMap = new Map(conversations.map((c) => [c.id, c]));
      const contexts: Record<number, ConversationKeyContext> = {};

      for (const convId of convIds) {
        const sample = rawItems.find((item) => item.source.conversation_id === convId);
        const convType = convMap.get(convId)?.type ?? sample?.source.conversation_type ?? 'private';

        if (convType === 'channel' || convType === 'saved') continue;

        if (convType === 'group') {
          const detail = await api<GroupDetailResponse>(`/api/chat/groups/${convId}`).catch(() => null);
          const memberIds = (detail?.members ?? []).map((m) => m.id);
          if (!memberIds.length) continue;
          contexts[convId] = buildE2EContextFromConversation(
            convId,
            'group',
            memberIds,
            user.id,
            null,
          );
          continue;
        }

        const partnerId =
          convMap.get(convId)?.other_user?.id ??
          rawItems
            .filter((item) => item.source.conversation_id === convId)
            .map((item) => item.message.user_id)
            .find((id) => id !== user.id) ??
          null;

        if (!partnerId) continue;

        contexts[convId] = buildE2EContextFromConversation(
          convId,
          'private',
          [user.id, partnerId],
          user.id,
          partnerId,
        );
      }

      return contexts;
    },
    [user],
  );

  const load = useCallback(async () => {
    const res = await api<{ data: SavedItem[] }>('/api/chat/messages/saved');
    const rawItems = res.data ?? [];
    const contexts = await resolveE2EContexts(rawItems);

    const byConv = new Map<number, number[]>();
    rawItems.forEach((item, index) => {
      const convId = item.source.conversation_id;
      if (!contexts[convId]) return;
      const list = byConv.get(convId) ?? [];
      list.push(index);
      byConv.set(convId, list);
    });

    const nextItems: SavedItem[] = rawItems.map((item) => ({
      ...item,
      message: { ...item.message },
    }));

    for (const [convId, indexes] of byConv) {
      const ctx = contexts[convId];
      if (!ctx) continue;
      const messages = indexes.map((i) => nextItems[i]!.message);
      const decrypted = await decryptMessagesForConversation(user!.id, ctx, messages).catch(() => messages);
      indexes.forEach((i, idx) => {
        nextItems[i] = {
          ...nextItems[i]!,
          message: decrypted[idx] ?? nextItems[i]!.message,
        };
      });
    }

    setE2eContextsByConversation(contexts);
    setItems(nextItems);
  }, [resolveE2EContexts, user]);

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
    if (file.size > maxBytesForFile(file)) {
      window.alert(
        `«${file.name}» больше ${isVideoAttachment(file) ? '50' : '15'} МБ`,
      );
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

  const syncEmojiCaret = () => {
    const el = textareaRef.current;
    if (!el) return;
    emojiCaretRef.current = el.selectionStart ?? text.length;
  };

  const insertEmoji = (emoji: string) => {
    const input = textareaRef.current;
    const pickerOnly = isMobile && showEmojiPicker;
    const start = pickerOnly
      ? (emojiCaretRef.current ?? text.length)
      : (input?.selectionStart ?? text.length);
    const end = pickerOnly
      ? (emojiCaretRef.current ?? text.length)
      : (input?.selectionEnd ?? text.length);
    const next = text.slice(0, start) + emoji + text.slice(end);
    const pos = start + emoji.length;
    emojiCaretRef.current = pos;
    setText(next);
    if (!pickerOnly) {
      window.setTimeout(() => {
        if (!input) return;
        input.focus();
        input.setSelectionRange(pos, pos);
      }, 0);
    }
  };

  const toggleEmojiPicker = () => {
    setShowEmojiPicker((open) => {
      const next = !open;
      if (next) {
        syncEmojiCaret();
        if (isMobile) textareaRef.current?.blur();
      } else {
        window.setTimeout(() => textareaRef.current?.focus(), 0);
      }
      return next;
    });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = text.trim();
    if (!content && !pendingAttachments.length) return;
    if (!user) return;

    const files = pendingAttachments.map((a) => a.file);
    setSending(true);
    setText('');
    clearAttachments();

    try {
      const preparedFiles = await Promise.all(
        files.map((file) => prepareMessageFileForSend(user.id, file)),
      );
      const inlineFiles = preparedFiles.filter((item) => item.mode === 'inline');
      const uploadedFiles = preparedFiles.filter(
        (item): item is Extract<PreparedMessageFile, { mode: 'uploaded' }> => item.mode === 'uploaded',
      );

      const form = new FormData();
      if (content) form.append('content', content);
      for (const item of inlineFiles) {
        form.append('file', item.file);
      }
      if (uploadedFiles.length) {
        form.append('uploaded_files', JSON.stringify(uploadedFiles));
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
      if (isMobile) {
        window.requestAnimationFrame(() => textareaRef.current?.focus());
      }
    }
  };

  const openImageLightbox = async (item: SavedItem) => {
    const m = item.message;
    const ctx = e2eContextsByConversation[item.source.conversation_id] ?? null;
    const resolveImageUrl = async (message: FormattedMessage) => {
      if (user && ctx) {
        const decrypted = await resolveDecryptedMediaUrl(
          user.id,
          ctx,
          message.file_path,
          message.file_original_name,
          mimeHintForMessageFile(message) ?? 'image/jpeg',
        ).catch(() => null);
        if (decrypted) return decrypted;
      }
      return storageDisplayUrl(message.file_path);
    };

    const firstUrl = await resolveImageUrl(m);
    if (!firstUrl) return;

    let urls = [firstUrl];
    let index = 0;
    if (m.album_group_id) {
      const album = items
        .filter(
          (i) =>
            i.source.conversation_id === item.source.conversation_id &&
            i.message.album_group_id === m.album_group_id &&
            effectiveMessageFileType(i.message) === 'image',
        )
        .map((i) => i.message);
      const withUrls = await Promise.all(
        album.map(async (img) => ({
          id: img.id,
          url: await resolveImageUrl(img),
        })),
      );
      urls = withUrls.map((entry) => entry.url).filter((u): u is string => !!u);
      index = Math.max(0, withUrls.findIndex((entry) => entry.id === m.id));
    }
    if (!urls.length) return;
    setLightbox({ urls, index });
  };

  const renderMessageBody = (item: SavedItem) => {
    const m = item.message;
    const e2eContext = e2eContextsByConversation[item.source.conversation_id] ?? null;
    if (m.is_deleted) {
      return <div className="msg-deleted">Сообщение удалено</div>;
    }

    const albumMessages =
      m.album_group_id && effectiveMessageFileType(m) === 'image'
        ? items.filter(
            (i) =>
              i.source.conversation_id === item.source.conversation_id &&
              i.message.album_group_id === m.album_group_id &&
              effectiveMessageFileType(i.message) === 'image',
          )
        : [];
    const showAlbum = albumMessages.length > 1;
    const isAlbumAnchor = !showAlbum || albumMessages[0]?.message.id === m.id;
    const text = displayMessageContent(m);

    if (showAlbum && !isAlbumAnchor) return null;

    return (
      <>
        {showAlbum ? (
          <div className={`fav-album-grid fav-album-grid--${Math.min(albumMessages.length, 4)}`}>
            {albumMessages.slice(0, 4).map((albumItem, idx) => (
              <FavoriteImageThumb
                key={albumItem.message.id}
                message={albumItem.message}
                userId={user?.id ?? ''}
                e2eContext={e2eContext}
                onClick={() => {
                  void openImageLightbox(item);
                }}
                moreCount={albumMessages.length > 4 && idx === 3 ? albumMessages.length - 4 : 0}
              />
            ))}
          </div>
        ) : (
          m.file_path &&
          effectiveMessageFileType(m) === 'image' && (
            <FavoriteImageThumb
              message={m}
              userId={user?.id ?? ''}
              e2eContext={e2eContext}
              onClick={() => {
                void openImageLightbox(item);
              }}
            />
          )
        )}
        <FavoriteNonImageAttachment message={m} userId={user?.id ?? ''} e2eContext={e2eContext} />
        {text && <div className="msg-content">{text}</div>}
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

      <div
        className={`favorites-feed${!loading && displayItems.length === 0 ? ' favorites-feed--empty' : ''}`}
        ref={feedRef}
      >
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
            accept="image/*,video/*,.heic,.heif,.mp4,.mov,.m4v,.webm,.3gp,.pdf,.doc,.docx,.webp"
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
                onChange={(e) => {
                  setText(e.target.value);
                  syncEmojiCaret();
                }}
                onSelect={syncEmojiCaret}
                onClick={syncEmojiCaret}
                onKeyUp={syncEmojiCaret}
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
            onPointerDown={(e) => e.preventDefault()}
          >
            <VellaraIcon name="send" size={20} />
          </button>
        </form>
      </div>

      {menu && (
        <div className="msg-menu-backdrop msg-menu-backdrop--desktop" onClick={() => setMenu(null)}>
          <div
            className="msg-context-menu msg-context-menu--popup"
            style={{ top: menu.y, left: menu.x }}
            onClick={(e) => e.stopPropagation()}
            role="menu"
          >
            <div className="msg-context-menu__list">
              {onForwardMessage && !menu.item.message.is_deleted && (
                <button
                  type="button"
                  className="msg-context-menu__list-item"
                  onClick={() => {
                    onForwardMessage(menu.item.message);
                    setMenu(null);
                  }}
                >
                  <VellaraIcon name="forward" size={18} />
                  <span>Переслать</span>
                </button>
              )}
              <button
                type="button"
                className="msg-context-menu__list-item danger"
                onClick={() => void removeFromFavorites(menu.item)}
              >
                <VellaraIcon name="trash" size={18} />
                <span>Убрать из избранного</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <ImageLightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
