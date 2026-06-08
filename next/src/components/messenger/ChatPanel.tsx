'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ContactAvatar } from '@/components/ContactAvatar';
import { EmojiPicker } from '@/components/EmojiPicker';
import { ImageLightbox } from '@/components/ImageLightbox';
import { MessageContextMenu } from '@/components/MessageContextMenu';
import { StatusDot } from '@/components/StatusDot';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import { useLongPress } from '@/hooks/useLongPress';
import { useSwipeBack } from '@/hooks/useSwipeGesture';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { storageDisplayUrl } from '@/lib/storage';
import type { ConversationListItem, FormattedMessage, MessageReplyPreview } from '@/lib/types';
import { buildMessageFeed, formatMessageTime, type ChatFeedItem } from '@/utils/chatDates';
import { formatVoiceDuration } from '@/utils/messagePreview';
import { senderColorForUserId, senderDisplayName } from '@/utils/senderColor';

type MsgMenuState = {
  show: boolean;
  x: number;
  y: number;
  message: FormattedMessage | null;
  canEdit: boolean;
  canDelete: boolean;
  canSave: boolean;
  isSaved: boolean;
};

const emptyMenu: MsgMenuState = {
  show: false,
  x: 0,
  y: 0,
  message: null,
  canEdit: false,
  canDelete: false,
  canSave: false,
  isSaved: false,
};

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const CHAT_FILE_INPUT_ID = 'chat-attach-input';

type PendingAttachment = {
  file: File;
  previewUrl: string | null;
  isImage: boolean;
};

function isImageAttachment(file: File) {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name);
}

export function ChatPanel({
  conversation,
  messages,
  messagesLoading = false,
  hasMoreOlder = false,
  loadingOlder = false,
  onLoadOlder,
  currentUserId,
  typingUserId,
  savedMessageIds,
  isMobile = false,
  enterAnim = false,
  onSend,
  onSendVoice,
  onEditMessage,
  onDeleteMessage,
  onToggleSave,
  onTyping,
  onOpenGroupSettings,
  onOpenGroupInfo,
  onOpenPartnerProfile,
  onBack,
}: {
  conversation: ConversationListItem | null;
  messages: FormattedMessage[];
  messagesLoading?: boolean;
  hasMoreOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => Promise<void>;
  currentUserId: string;
  typingUserId: string | null;
  savedMessageIds: Set<number>;
  isMobile?: boolean;
  enterAnim?: boolean;
  onSend: (text: string, file?: File, replyToId?: number) => Promise<void>;
  onSendVoice?: (blob: Blob, duration: number, mimeType: string) => Promise<void>;
  onEditMessage?: (messageId: number, content: string) => Promise<void>;
  onDeleteMessage?: (messageId: number) => Promise<void>;
  onToggleSave?: (messageId: number) => Promise<void>;
  onTyping: () => void;
  onOpenGroupSettings?: () => void;
  onOpenGroupInfo?: () => void;
  onOpenPartnerProfile?: () => void;
  onBack?: () => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessage, setEditingMessage] = useState<FormattedMessage | null>(null);
  const [msgMenu, setMsgMenu] = useState<MsgMenuState>(emptyMenu);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [replyTo, setReplyTo] = useState<FormattedMessage | null>(null);
  const menuCloseLockRef = useRef(0);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevConvIdRef = useRef<number | null>(null);
  const prevMessageCountRef = useRef(0);
  const scrollReadyRef = useRef(false);
  const prependAnchorRef = useRef<number | null>(null);
  const [scrollReady, setScrollReady] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);

  const {
    isRecording,
    recordingSeconds,
    error: voiceError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecorder();

  const feed = useMemo(() => buildMessageFeed(messages), [messages]);
  const isOtherTyping = typingUserId && typingUserId !== currentUserId;

  const scrollToBottom = (mode: 'instant' | 'smooth' = 'instant') => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (mode === 'instant') {
      el.scrollTop = el.scrollHeight;
      return;
    }
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  };

  const finalizeInitialScroll = () => {
    if (scrollReadyRef.current) return;
    scrollToBottom('instant');
    scrollReadyRef.current = true;
    setScrollReady(true);
  };

  const handleMessageMediaLoad = () => {
    if (!scrollReadyRef.current) {
      scrollToBottom('instant');
      return;
    }
    if (stickToBottomRef.current) {
      scrollToBottom('instant');
    }
  };

  useEffect(() => {
    const convId = conversation?.id ?? null;
    if (convId !== prevConvIdRef.current) {
      prevConvIdRef.current = convId;
      prevMessageCountRef.current = 0;
      scrollReadyRef.current = false;
      setScrollReady(false);
      stickToBottomRef.current = true;
      setReplyTo(null);
    }
  }, [conversation?.id]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distance < 96;
      if (
        el.scrollTop < 120 &&
        hasMoreOlder &&
        !loadingOlder &&
        onLoadOlder &&
        scrollReadyRef.current
      ) {
        prependAnchorRef.current = el.scrollHeight;
        void onLoadOlder();
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [conversation?.id, hasMoreOlder, loadingOlder, onLoadOlder]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || messagesLoading) return;

    if (prependAnchorRef.current != null) {
      const prevHeight = prependAnchorRef.current;
      prependAnchorRef.current = null;
      el.scrollTop = el.scrollHeight - prevHeight;
      prevMessageCountRef.current = messages.length;
      return;
    }

    const count = messages.length;
    if (!count) {
      scrollReadyRef.current = true;
      setScrollReady(true);
      return;
    }

    if (!scrollReadyRef.current) {
      scrollToBottom('instant');
      let stableFrames = 0;
      let lastHeight = el.scrollHeight;

      const ro = new ResizeObserver(() => {
        if (scrollReadyRef.current) return;
        scrollToBottom('instant');
        const height = el.scrollHeight;
        if (height === lastHeight) {
          stableFrames += 1;
          if (stableFrames >= 2) finalizeInitialScroll();
        } else {
          stableFrames = 0;
          lastHeight = height;
        }
      });
      ro.observe(el);

      const maxWait = window.setTimeout(finalizeInitialScroll, 2500);

      prevMessageCountRef.current = count;
      return () => {
        ro.disconnect();
        window.clearTimeout(maxWait);
      };
    }

    const grew = count > prevMessageCountRef.current;
    prevMessageCountRef.current = count;
    if (!grew) return;

    const last = messages[count - 1];
    const shouldScroll = stickToBottomRef.current || last?.user_id === currentUserId;
    if (!shouldScroll) return;

    const mode = last?.user_id === currentUserId ? 'instant' : 'smooth';
    requestAnimationFrame(() => scrollToBottom(mode));
  }, [messages, messagesLoading, currentUserId]);

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
      if (inputAreaRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('.emoji-picker')) return;
      setShowEmojiPicker(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [showEmojiPicker]);

  useEffect(() => {
    if (voiceError) window.alert(voiceError);
  }, [voiceError]);

  useEffect(() => {
    return () => {
      if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    };
  }, [pendingAttachment?.previewUrl]);

  useEffect(() => {
    if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    setPendingAttachment(null);
    if (fileRef.current) fileRef.current.value = '';
  }, [conversation?.id]);

  const clearAttachment = () => {
    if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    setPendingAttachment(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      window.alert('Файл больше 15 МБ');
      return;
    }

    if (pendingAttachment?.previewUrl) URL.revokeObjectURL(pendingAttachment.previewUrl);
    const isImage = isImageAttachment(file);
    setPendingAttachment({
      file,
      isImage,
      previewUrl: isImage ? URL.createObjectURL(file) : null,
    });
    onTyping();
  };

  const showMessages = !messagesLoading;
  const chatReady = showMessages && (messages.length === 0 || scrollReady);

  const swipeBack = useSwipeBack({
    enabled: Boolean(isMobile && onBack && chatReady),
    onBack: () => onBack?.(),
  });

  const isGroup = conversation?.type === 'group';
  const isGroupAdmin = conversation?.my_role === 'admin';
  const canSendVoice =
    !isGroup ||
    conversation?.allow_voice_messages !== false ||
    isGroupAdmin;

  const canEditMsg = (msg: FormattedMessage) => {
    if (!msg || msg.is_deleted || msg.message_type === 'system') return false;
    if (msg.user_id === currentUserId) return true;
    return !!isGroup && isGroupAdmin;
  };

  const canDeleteMsg = (msg: FormattedMessage) => {
    if (!msg || msg.is_deleted || msg.message_type === 'system') return false;
    if (msg.user_id === currentUserId) return true;
    return !!isGroup && isGroupAdmin;
  };

  const openMessageMenu = (
    event: { clientX?: number; clientY?: number; preventDefault?: () => void },
    msg: FormattedMessage,
  ) => {
    if (msg.message_type === 'system' || msg.is_deleted) return;

    const canEdit = canEditMsg(msg) && (!msg.file_path || !!msg.content);
    const canDelete = canDeleteMsg(msg);
    const canSave = msg.message_type === 'user' && !msg.is_deleted;
    if (!canEdit && !canDelete && !canSave) return;

    event.preventDefault?.();

    if (msgMenu.show && msgMenu.message?.id === msg.id) return;

    const clientX = event.clientX ?? 0;
    const clientY = event.clientY ?? 0;
    menuCloseLockRef.current = Date.now() + 450;

    setMsgMenu({
      show: true,
      x: Math.min(Math.max(clientX, 12), window.innerWidth - 192),
      y: Math.min(Math.max(clientY, 12), window.innerHeight - 120),
      message: msg,
      canEdit,
      canDelete,
      canSave,
      isSaved: savedMessageIds.has(msg.id),
    });
  };

  const closeMessageMenu = () => {
    if (Date.now() < menuCloseLockRef.current) return;
    setMsgMenu(emptyMenu);
  };

  const longPress = useLongPress((touchEvent) => {
    const msg = touchEvent.payload as FormattedMessage;
    openMessageMenu(touchEvent, msg);
  });

  const startEditMessage = () => {
    const msg = msgMenu.message;
    if (!msg) return;
    setReplyTo(null);
    setEditingMessage(msg);
    setText(msg.content || '');
    closeMessageMenu();
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const startReplyMessage = () => {
    const msg = msgMenu.message;
    if (!msg || msg.is_deleted) return;
    setEditingMessage(null);
    setReplyTo(msg);
    closeMessageMenu();
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const replyPreviewText = (msg: FormattedMessage | MessageReplyPreview) => {
    if (msg.is_deleted) return 'Сообщение удалено';
    if (msg.file_type === 'voice') return 'Голосовое сообщение';
    if (msg.file_type === 'image') return 'Фото';
    if (msg.file_type === 'document') return 'Файл';
    const text = (msg.content || '').trim();
    return text.length > 80 ? `${text.slice(0, 80)}…` : text || 'Сообщение';
  };

  const openImageLightbox = (m: FormattedMessage) => {
    const url = storageDisplayUrl(m.file_path) ?? '';
    if (!url) return;
    let urls = [url];
    let index = 0;
    if (m.album_group_id) {
      urls = messages
        .filter((x) => x.album_group_id === m.album_group_id && x.file_type === 'image')
        .map((x) => storageDisplayUrl(x.file_path))
        .filter((u): u is string => !!u);
      index = Math.max(0, urls.indexOf(url));
    }
    setLightbox({ urls, index });
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setText('');
  };

  const handleDeleteMessage = async () => {
    const msg = msgMenu.message;
    closeMessageMenu();
    if (!msg || !onDeleteMessage) return;
    try {
      await onDeleteMessage(msg.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось удалить');
    }
  };

  const handleToggleSave = async () => {
    const msg = msgMenu.message;
    closeMessageMenu();
    if (!msg || !onToggleSave) return;
    try {
      await onToggleSave(msg.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const insertEmoji = (emoji: string) => {
    const input = textareaRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    onTyping();
    window.setTimeout(() => {
      if (!input) return;
      const pos = start + emoji.length;
      input.focus();
      input.setSelectionRange(pos, pos);
    }, 0);
  };

  const startVoiceRecord = async () => {
    if (!canSendVoice) {
      window.alert('Голосовые сообщения отключены администратором группы');
      return;
    }
    setShowEmojiPicker(false);
    const ok = await startRecording();
    if (!ok && voiceError) window.alert(voiceError);
  };

  const finishVoiceRecord = async () => {
    const result = await stopRecording();
    if (!result || !onSendVoice) return;
    if (result.duration < 1) {
      window.alert('Запись слишком короткая');
      return;
    }
    setIsSendingVoice(true);
    try {
      await onSendVoice(result.blob, result.duration, result.mimeType);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Не удалось отправить голосовое');
    } finally {
      setIsSendingVoice(false);
    }
  };

  if (!conversation) {
    return (
      <section className="chat-area chat-panel--empty">
        <p>Выберите чат или начните новый из контактов</p>
      </section>
    );
  }

  const partner = conversation.other_user;
  const title = isGroup
    ? conversation.title ?? 'Группа'
    : partner
      ? `${partner.name} ${partner.last_name}`.trim()
      : 'Чат';

  const headerLetter = isGroup
    ? (conversation.title?.[0] || 'G').toUpperCase()
    : `${partner?.name?.[0] || ''}${partner?.last_name?.[0] || ''}`.toUpperCase() || '?';
  const headerAvatar = !isGroup && partner?.avatar ? storageDisplayUrl(partner.avatar) : null;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = text.trim();

    if (editingMessage) {
      if (!content) {
        window.alert('Введите текст сообщения');
        return;
      }
      if (!onEditMessage) return;
      setSending(true);
      try {
        await onEditMessage(editingMessage.id, content);
        cancelEdit();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Не удалось сохранить');
      } finally {
        setSending(false);
      }
      return;
    }

    if (!content && !pendingAttachment) return;
    setSending(true);
    try {
      await onSend(content, pendingAttachment?.file, replyTo?.id);
      setText('');
      clearAttachment();
      setReplyTo(null);
      stickToBottomRef.current = true;
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  };

  const showGroupSenderAvatar = (m: FormattedMessage) =>
    isGroup && m.user_id !== currentUserId && m.message_type !== 'system';

  const renderStatus = (m: FormattedMessage, mine: boolean) => {
    if (!mine || m.message_type !== 'user' || m.is_deleted) return null;

    if (isGroup) {
      const status = m.group_read_status || 'sent';
      const classes = ['status-icon'];
      if (status === 'partial') classes.push('partial');
      if (status === 'all') classes.push('read');
      return <span className={classes.join(' ')}>{status === 'sent' ? '✓' : '✓✓'}</span>;
    }

    return (
      <span className={`status-icon ${m.read_at ? 'read' : ''}`}>
        {m.read_at ? '✓✓' : '✓'}
      </span>
    );
  };

  const renderBubble = (m: FormattedMessage, mine: boolean) => {
    const isSystem = m.message_type === 'system';
    const voiceOnly = m.file_type === 'voice' && !m.content;

    if (isSystem) {
      return (
        <div className="message-system">
          <span className="message-system__text">{m.content}</span>
          <span className="message-system__time">{formatMessageTime(m.created_at)}</span>
        </div>
      );
    }

    return (
      <div
        className={`message-bubble ${mine ? 'my' : 'other'} ${m.is_deleted ? 'message-bubble--deleted' : ''} ${voiceOnly ? 'voice-only' : ''}`}
      >
        {m.is_deleted ? (
          <span className="msg-deleted">Сообщение удалено</span>
        ) : (
          <>
            {m.reply_to && (
              <div className="msg-reply-quote">
                <span className="msg-reply-quote__author">
                  {senderDisplayName(m.reply_to.sender)}
                </span>
                <span className="msg-reply-quote__text">{replyPreviewText(m.reply_to)}</span>
              </div>
            )}
            {m.file_path && m.file_type === 'image' && storageDisplayUrl(m.file_path) && (
              <button
                type="button"
                className="msg-image-btn"
                onClick={() => openImageLightbox(m)}
              >
                <img
                  src={storageDisplayUrl(m.file_path) ?? ''}
                  alt="Фото"
                  decoding="async"
                  onLoad={handleMessageMediaLoad}
                />
              </button>
            )}
            {m.file_path && m.file_type === 'voice' && (
              <VoiceMessagePlayer
                src={storageDisplayUrl(m.file_path) ?? ''}
                duration={m.voice_duration || 0}
                isMine={mine}
              />
            )}
            {m.file_path && m.file_type === 'document' && (
              <a
                className="msg-doc-link"
                href={storageDisplayUrl(m.file_path) ?? '#'}
                target="_blank"
                rel="noreferrer"
              >
                <span className="msg-doc-icon">📄</span>
                <span className="msg-doc-name">{m.file_original_name ?? 'Файл'}</span>
              </a>
            )}
            {m.content && <div className="msg-content">{m.content}</div>}
            <div className="msg-meta">
              {m.is_edited && <span className="msg-edited">изм.</span>}
              <span className="msg-time">{formatMessageTime(m.created_at)}</span>
              {renderStatus(m, mine)}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderFeedItem = (item: ChatFeedItem) => {
    if (item.kind === 'date') {
      return (
        <div key={item.key} className="message-date">
          <span className="message-date__label">{item.label}</span>
        </div>
      );
    }

    const m = item.message;
    const mine = m.user_id === currentUserId;
    const isSystem = m.message_type === 'system';

    if (isSystem) {
      return (
        <div key={item.key} className="message-row message-row--system">
          {renderBubble(m, mine)}
        </div>
      );
    }

    return (
      <div
        key={item.key}
        className={`message-row ${mine ? 'message-row--mine' : 'message-row--other'}`}
        onContextMenu={(e) => openMessageMenu(e, m)}
        onTouchStart={(e) => longPress.onTouchStart(e, m)}
        onTouchMove={longPress.onTouchMove}
        onTouchEnd={longPress.onTouchEnd}
        onTouchCancel={longPress.onTouchCancel}
      >
        <div
          className={`message-row-body ${mine ? 'message-row-body--mine' : 'message-row-body--other'} ${isGroup ? 'message-row-body--group' : ''}`}
        >
          {showGroupSenderAvatar(m) && (
            <button type="button" className="msg-avatar-btn" title="Профиль">
              <ContactAvatar
                name={m.sender?.name ?? ''}
                lastName={m.sender?.last_name ?? ''}
                avatar={m.sender?.avatar}
                size="sm"
              />
            </button>
          )}
          <div className="message-row-content">
            {isGroup && !mine && (
              <p className="msg-sender-name" style={{ color: senderColorForUserId(m.user_id) }}>
                {senderDisplayName(m.sender)}
              </p>
            )}
            {renderBubble(m, mine)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      ref={swipeBack.bindRef}
      className={`chat-area${!chatReady ? ' chat-area--loading' : ''}${enterAnim ? ' chat-area--enter' : ''}${swipeBack.isDragging ? ' chat-area--dragging' : ''}${swipeBack.isClosing ? ' chat-area--closing' : ''}`}
      onTouchStart={swipeBack.handlers.onTouchStart}
      onTouchMove={swipeBack.handlers.onTouchMove}
      onTouchEnd={swipeBack.handlers.onTouchEnd}
      onTouchCancel={swipeBack.handlers.onTouchCancel}
    >
      <header className="chat-header">
        {onBack && (
          <button type="button" className="btn-back-chat" aria-label="Назад к списку" onClick={onBack}>
            ←
          </button>
        )}

        <button
          type="button"
          className="header-profile-link"
          onClick={isGroup ? onOpenGroupInfo : onOpenPartnerProfile}
        >
          <div className={`header-avatar ${isGroup ? 'header-avatar--group' : ''}`}>
            {headerAvatar ? (
              <img src={headerAvatar} alt="" className="header-avatar-img" />
            ) : (
              <span className="header-avatar-letter">{headerLetter}</span>
            )}
          </div>
          <div className="header-content">
            <h3>{title}</h3>
            {isGroup ? (
              <span className="header-group-meta">
                {conversation.members_count ?? 0} участников
                {isGroupAdmin ? ' · вы админ' : ''}
              </span>
            ) : partner ? (
              <StatusDot lastSeenAt={partner.last_seen_at} showLabel />
            ) : null}
          </div>
        </button>

        {isGroup && isGroupAdmin && onOpenGroupSettings && (
          <button
            type="button"
            className="btn-group-settings"
            title="Настройки группы"
            onClick={onOpenGroupSettings}
          >
            ⚙
          </button>
        )}
      </header>

      <div
        className={`messages-container${showMessages && messages.length && !scrollReady ? ' messages-container--preparing' : ''}`}
        ref={messagesContainerRef}
      >
        {!showMessages ? (
          <div className="chat-loading" aria-busy="true" aria-label="Загрузка сообщений">
            <div className="chat-loading__spinner" />
          </div>
        ) : (
          <>
            {loadingOlder && (
              <div className="messages-load-older" aria-hidden="true">
                Загрузка…
              </div>
            )}
            {feed.map(renderFeedItem)}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {showMessages && (
        <div
          className={`chat-typing-bar ${isOtherTyping ? 'chat-typing-bar--visible' : ''}`}
          aria-live="polite"
          aria-hidden={!isOtherTyping}
        >
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
          <span className="typing-text">печатает…</span>
        </div>
      )}

      {lightbox && (
        <ImageLightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />
      )}

      {chatReady && isRecording ? (
        <div className="voice-record-bar">
          <button type="button" className="btn-voice-cancel" title="Отмена" onClick={cancelRecording}>
            ✕
          </button>
          <span className="record-dot" />
          <span className="record-timer">{formatVoiceDuration(recordingSeconds)}</span>
          <span className="record-hint">Запись…</span>
          <button
            type="button"
            className="btn-voice-send"
            disabled={isSendingVoice}
            onClick={() => void finishVoiceRecord()}
          >
            {isSendingVoice ? '⏳' : '📤'}
          </button>
        </div>
      ) : chatReady ? (
        <div className="input-area input-area--ready" ref={inputAreaRef}>
          <input
            id={CHAT_FILE_INPUT_ID}
            ref={fileRef}
            type="file"
            className="composer-file-input"
            accept="image/*,.heic,.heif,.pdf,.doc,.docx,.webp"
            onChange={handleFileSelect}
          />
          {pendingAttachment && (
            <div className="attachments-panel">
              <div className="attachments-panel__head">
                <span>{pendingAttachment.isImage ? 'Фото' : pendingAttachment.file.name}</span>
                <button type="button" className="attachments-clear" onClick={clearAttachment}>
                  Убрать
                </button>
              </div>
              <div className="attachments-grid">
                <div
                  className={`attachment-item ${pendingAttachment.isImage ? '' : 'attachment-item--doc'}`}
                >
                  {pendingAttachment.isImage && pendingAttachment.previewUrl ? (
                    <img src={pendingAttachment.previewUrl} alt="" className="attachment-thumb" />
                  ) : (
                    <div className="attachment-doc">
                      <span>📄</span>
                      <span className="attachment-doc-name">{pendingAttachment.file.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    className="attachment-remove"
                    title="Убрать"
                    onClick={clearAttachment}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          )}
          <form
            className="composer composer--telegram"
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
          >
            <label
              htmlFor={CHAT_FILE_INPUT_ID}
              className="composer-btn composer-btn--attach"
              title="Прикрепить файл"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              📎
            </label>
            <div className="composer-field">
              {replyTo && !editingMessage && (
                <div className="composer-reply">
                  <div className="composer-reply__accent" aria-hidden="true" />
                  <div className="composer-reply__body">
                    <span className="composer-reply__author">{senderDisplayName(replyTo.sender)}</span>
                    <span className="composer-reply__text">{replyPreviewText(replyTo)}</span>
                  </div>
                  <button
                    type="button"
                    className="composer-reply__close"
                    aria-label="Отменить ответ"
                    onClick={() => setReplyTo(null)}
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="composer-input-row">
                <div className="input-tools">
                  <button
                    ref={emojiBtnRef}
                    type="button"
                    className={`composer-btn composer-btn--emoji ${showEmojiPicker ? 'composer-btn--active' : ''}`}
                    title="Смайлики"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowEmojiPicker((v) => !v);
                    }}
                  >
                    😊
                  </button>
                  {showEmojiPicker && (
                    <EmojiPicker
                      anchorRef={emojiBtnRef}
                      onSelect={insertEmoji}
                      onClose={() => setShowEmojiPicker(false)}
                    />
                  )}
                </div>
                <textarea
                  ref={textareaRef}
                  className="msg-input"
                  rows={1}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    onTyping();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSubmit();
                    }
                  }}
                  placeholder={editingMessage ? 'Редактирование…' : 'Сообщение'}
                  maxLength={2000}
                />
              </div>
            </div>
            {editingMessage ? (
              <button type="button" className="composer-btn" title="Отменить" onClick={cancelEdit}>
                ✕
              </button>
            ) : canSendVoice && onSendVoice && !text.trim() && !pendingAttachment ? (
              <button
                type="button"
                className="composer-btn composer-btn--voice"
                title="Голосовое сообщение"
                onClick={() => void startVoiceRecord()}
              >
                🎤
              </button>
            ) : (
              <button
                type="submit"
                className="composer-btn composer-btn--send"
                title="Отправить"
                disabled={sending || (!editingMessage && !text.trim() && !pendingAttachment)}
              >
                ➤
              </button>
            )}
          </form>
        </div>
      ) : null}

      <MessageContextMenu
        show={msgMenu.show}
        x={msgMenu.x}
        y={msgMenu.y}
        isMobile={isMobile}
        canReply={!!msgMenu.message && !msgMenu.message.is_deleted}
        canEdit={msgMenu.canEdit}
        canDelete={msgMenu.canDelete}
        canSave={msgMenu.canSave}
        isSaved={msgMenu.isSaved}
        onReply={startReplyMessage}
        onSave={() => void handleToggleSave()}
        onEdit={startEditMessage}
        onDelete={() => void handleDeleteMessage()}
        onClose={closeMessageMenu}
      />
    </section>
  );
}
