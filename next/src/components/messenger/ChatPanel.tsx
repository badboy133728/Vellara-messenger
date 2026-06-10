'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ContactAvatar } from '@/components/ContactAvatar';
import { EmojiPicker } from '@/components/EmojiPicker';
import { ImageLightbox } from '@/components/ImageLightbox';
import { MessageContextMenu } from '@/components/MessageContextMenu';
import { StatusDot } from '@/components/StatusDot';
import { RTL_REVEAL_MAX, useMessageRowGesture } from '@/hooks/useMessageRowGesture';
import { useSwipeBack } from '@/hooks/useSwipeGesture';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import type { ConversationKeyContext } from '@/lib/crypto/conversationKey';
import { isE2EContent } from '@/lib/crypto/message';
import {
  displayMessageContent,
  resolveDecryptedMediaUrl,
} from '@/lib/e2e/messageCrypto';
import { storageDisplayUrl } from '@/lib/storage';
import type { ConversationListItem, FormattedMessage, MessageReplyPreview } from '@/lib/types';
import {
  E2EDocumentAttachment,
  E2EImageAttachment,
  E2EVideoAttachment,
  E2EVoiceAttachment,
} from '@/components/messenger/E2EMessageAttachment';
import {
  effectiveMessageFileType,
  isImageAttachment,
  isVideoAttachment,
  maxBytesForFile,
} from '@/lib/chat/attachmentTypes';
import type { SendMessageOptions } from '@/lib/chat/sendMessage';
import {
  buildMessageFeed,
  formatMessageTime,
  type ChatFeedItem,
  type PendingFeedItem,
} from '@/utils/chatDates';
import { formatVoiceDuration } from '@/utils/messagePreview';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import { conversationTitle } from '@/utils/conversationList';
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

const CHAT_FILE_INPUT_ID = 'chat-attach-input';

type PendingAttachment = {
  id: string;
  file: File;
  previewUrl: string | null;
  isImage: boolean;
  isVideo: boolean;
  previewLoading: boolean;
};

type PendingSend = {
  clientId: string;
  content: string;
  previewUrls: string[];
  videoPreviewUrls: string[];
  fileCount: number;
  created_at: string;
  expectedIds: number[];
  baselineMessageIds: number[];
};

/** Скрываем pending в том же кадре, когда реальное сообщение уже в ленте — без дубля пузырей. */
function pendingStillVisible(
  pending: PendingSend,
  messages: FormattedMessage[],
  currentUserId: string,
) {
  const knownIds = new Set(messages.map((m) => m.id));
  if (pending.expectedIds.length > 0 && pending.expectedIds.every((id) => knownIds.has(id))) {
    return false;
  }

  const baseline = new Set(pending.baselineMessageIds);
  const newFromMe = messages.filter(
    (m) => m.user_id === currentUserId && !baseline.has(m.id),
  );
  if (!newFromMe.length) return true;

  if (pending.previewUrls.length > 0) {
    const newImages = newFromMe.filter((m) => effectiveMessageFileType(m) === 'image');
    return newImages.length < pending.previewUrls.length;
  }

  if (pending.videoPreviewUrls.length > 0) {
    const newVideos = newFromMe.filter((m) => effectiveMessageFileType(m) === 'video');
    return newVideos.length < pending.videoPreviewUrls.length;
  }

  if (pending.fileCount > 0) {
    const withFile = newFromMe.filter((m) => m.file_path);
    return withFile.length < pending.fileCount;
  }

  if (pending.content) {
    const text = pending.content.trim();
    return !newFromMe.some((m) => !m.file_path && (m.content || '').trim() === text);
  }

  return newFromMe.length === 0;
}

export function ChatPanel({
  conversation,
  e2eContext = null,
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
  onForwardMessage,
  onTyping,
  onOpenGroupSettings,
  onOpenGroupInfo,
  onOpenPartnerProfile,
  onOpenChatActions,
  onBack,
  onFilePickerOpen,
  onFilePickerDone,
}: {
  conversation: ConversationListItem | null;
  e2eContext?: ConversationKeyContext | null;
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
  onSend: (text: string, options?: SendMessageOptions) => Promise<number[]>;
  onSendVoice?: (blob: Blob, duration: number, mimeType: string) => Promise<void>;
  onEditMessage?: (messageId: number, content: string) => Promise<void>;
  onDeleteMessage?: (messageId: number) => Promise<void>;
  onToggleSave?: (messageId: number) => Promise<void>;
  onForwardMessage?: (messages: FormattedMessage | FormattedMessage[]) => void;
  onTyping: () => void;
  onOpenGroupSettings?: () => void;
  onOpenGroupInfo?: () => void;
  onOpenPartnerProfile?: () => void;
  onOpenChatActions?: () => void;
  onBack?: () => void;
  onFilePickerOpen?: () => void;
  onFilePickerDone?: () => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessage, setEditingMessage] = useState<FormattedMessage | null>(null);
  const [msgMenu, setMsgMenu] = useState<MsgMenuState>(emptyMenu);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [pendingSends, setPendingSends] = useState<PendingSend[]>([]);
  const [replyTo, setReplyTo] = useState<FormattedMessage | null>(null);
  const [forwardSelectMode, setForwardSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<number>>(new Set());
  const menuCloseLockRef = useRef(0);
  const attachmentUrlsRef = useRef<Set<string>>(new Set());

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
  const headerRef = useRef<HTMLElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLElement | null>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);

  const {
    isRecording,
    recordingSeconds,
    error: voiceError,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecorder();

  const visiblePendingSends = useMemo(
    () => pendingSends.filter((p) => pendingStillVisible(p, messages, currentUserId)),
    [pendingSends, messages, currentUserId],
  );

  const feed = useMemo(
    () =>
      buildMessageFeed(
        messages,
        visiblePendingSends.map((p) => ({
          key: `pending-${p.clientId}`,
          clientId: p.clientId,
          created_at: p.created_at,
          content: p.content,
          previewUrls: p.previewUrls,
          videoPreviewUrls: p.videoPreviewUrls,
        })),
      ),
    [messages, visiblePendingSends],
  );
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

  useLayoutEffect(() => {
    if (messagesLoading) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    scrollToBottom('instant');
    if (messages.length === 0) {
      scrollReadyRef.current = true;
      setScrollReady(true);
    }
  }, [conversation?.id, messagesLoading, messages.length]);

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

      const maxWait = window.setTimeout(finalizeInitialScroll, isMobile ? 600 : 2500);

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
  }, [messages, messagesLoading, currentUserId, isMobile]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  useEffect(() => {
    if (!text.trim()) return;
    onTyping();
    const id = window.setInterval(() => onTyping(), 2000);
    return () => window.clearInterval(id);
  }, [text, onTyping]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (composerDockRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('.emoji-picker')) return;
      if (emojiBtnRef.current?.contains(target)) return;
      setShowEmojiPicker(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [showEmojiPicker]);

  const toggleEmojiPicker = () => {
    setShowEmojiPicker((open) => {
      const next = !open;
      if (next) {
        if (isMobile) textareaRef.current?.blur();
        stickToBottomRef.current = true;
        requestAnimationFrame(() => scrollToBottom('instant'));
      } else {
        window.setTimeout(() => textareaRef.current?.focus(), 0);
      }
      return next;
    });
  };

  useEffect(() => {
    if (voiceError) window.alert(voiceError);
  }, [voiceError]);

  const revokeAttachmentUrl = (url: string | null) => {
    if (!url || !attachmentUrlsRef.current.has(url)) return;
    URL.revokeObjectURL(url);
    attachmentUrlsRef.current.delete(url);
  };

  const revokeAllAttachmentUrls = () => {
    for (const url of attachmentUrlsRef.current) URL.revokeObjectURL(url);
    attachmentUrlsRef.current.clear();
  };

  useEffect(() => {
    return () => revokeAllAttachmentUrls();
  }, []);

  useEffect(() => {
    revokeAllAttachmentUrls();
    setPendingAttachments([]);
    if (fileRef.current) fileRef.current.value = '';
  }, [conversation?.id]);

  useEffect(() => {
    setPendingSends((prev) => {
      if (!prev.length) return prev;
      const next = prev.filter((p) => pendingStillVisible(p, messages, currentUserId));
      if (next.length === prev.length) return prev;
      for (const removed of prev) {
        if (next.some((p) => p.clientId === removed.clientId)) continue;
        for (const url of [...removed.previewUrls, ...removed.videoPreviewUrls]) {
          URL.revokeObjectURL(url);
        }
      }
      return next;
    });
  }, [messages, currentUserId]);

  useEffect(() => {
    if (!pendingSends.length) return;
    stickToBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom('instant'));
  }, [pendingSends.length]);

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

  const loadAttachmentPreview = (id: string, file: File) => {
    window.setTimeout(() => {
      const url = URL.createObjectURL(file);
      attachmentUrlsRef.current.add(url);
      setPendingAttachments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, previewUrl: url, previewLoading: false } : a,
        ),
      );
    }, 0);
  };

  const addAttachmentFile = (file: File) => {
    const limit = maxBytesForFile(file);
    if (file.size > limit) {
      window.alert(
        `«${file.name}» больше ${isVideoAttachment(file) ? '50' : '15'} МБ`,
      );
      return;
    }
    const isImage = isImageAttachment(file);
    const isVideo = !isImage && isVideoAttachment(file);
    const needsPreview = isImage || isVideo;
    const id = crypto.randomUUID();
    setPendingAttachments((prev) => [
      ...prev,
      { id, file, isImage, isVideo, previewUrl: null, previewLoading: needsPreview },
    ]);
    if (needsPreview) loadAttachmentPreview(id, file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = '';
    onFilePickerDone?.();
    if (!files.length) return;
    for (const file of files) addAttachmentFile(file);
  };

  const showMessages = !messagesLoading;
  const chatReady = showMessages && (messages.length === 0 || scrollReady);
  const showComposerArea = showMessages;

  const swipeBack = useSwipeBack({
    enabled: Boolean(isMobile && onBack && chatReady),
    onBack: () => onBack?.(),
  });

  const bindChatAreaRef = (node: HTMLElement | null) => {
    chatAreaRef.current = node;
  };

  const resetChatSwipe = swipeBack.reset;

  useEffect(() => {
    resetChatSwipe();
  }, [conversation?.id, resetChatSwipe]);

  useLayoutEffect(() => {
    if (!isMobile || !conversation) return;
    const area = chatAreaRef.current;
    const header = headerRef.current;
    const dock = composerDockRef.current;
    if (!area || !header || !dock) return;

    const syncChromeHeights = () => {
      area.style.setProperty('--vellara-chat-header-h', `${header.offsetHeight}px`);
      area.style.setProperty('--vellara-chat-composer-h', `${dock.offsetHeight}px`);
    };

    syncChromeHeights();
    const ro = new ResizeObserver(syncChromeHeights);
    ro.observe(header);
    ro.observe(dock);
    return () => ro.disconnect();
  }, [isMobile, conversation?.id, showMessages, isRecording, pendingAttachments.length, isOtherTyping, showEmojiPicker]);

  useLayoutEffect(() => {
    if (!isMobile || messagesLoading) return;
    scrollToBottom('instant');
    if (!scrollReadyRef.current) {
      scrollReadyRef.current = true;
      setScrollReady(true);
    }
  }, [isMobile, messagesLoading, conversation?.id, messages.length]);

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

  const canForwardMsg = (msg: FormattedMessage) =>
    msg.message_type === 'user' && !msg.is_deleted;

  const messageIdsForSelection = (msg: FormattedMessage) => {
    if (msg.album_group_id && effectiveMessageFileType(msg) === 'image') {
      return messages
        .filter(
          (m) =>
            m.album_group_id === msg.album_group_id &&
            effectiveMessageFileType(m) === 'image' &&
            canForwardMsg(m),
        )
        .map((m) => m.id);
    }
    return canForwardMsg(msg) ? [msg.id] : [];
  };

  const openMessageMenu = (
    event: { clientX?: number; clientY?: number; preventDefault?: () => void },
    msg: FormattedMessage,
  ) => {
    if (msg.message_type === 'system' || msg.is_deleted) return;

    const canEdit = canEditMsg(msg) && (!msg.file_path || !!msg.content);
    const canDelete = canDeleteMsg(msg);
    const canSave = msg.message_type === 'user' && !msg.is_deleted;
    const canForward = msg.message_type === 'user' && !msg.is_deleted;
    if (!canEdit && !canDelete && !canSave && !canForward) return;

    event.preventDefault?.();

    if (msgMenu.show && msgMenu.message?.id === msg.id) return;

    const clientX = event.clientX ?? 0;
    const clientY = event.clientY ?? 0;
    menuCloseLockRef.current = Date.now() + 450;

    setMsgMenu({
      show: true,
      x: Math.min(Math.max(clientX, 12), window.innerWidth - 192),
      y: Math.max(clientY, 12),
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

  const enterForwardSelectMode = (msg: FormattedMessage) => {
    const ids = messageIdsForSelection(msg);
    if (!ids.length) return;
    closeMessageMenu();
    setForwardSelectMode(true);
    setSelectedMessageIds(new Set(ids));
  };

  const exitForwardSelectMode = () => {
    setForwardSelectMode(false);
    setSelectedMessageIds(new Set());
  };

  const toggleForwardSelection = (msg: FormattedMessage) => {
    const ids = messageIdsForSelection(msg);
    if (!ids.length) return;
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const submitForwardSelection = () => {
    if (!onForwardMessage || selectedMessageIds.size === 0) return;
    const selected = messages.filter((m) => selectedMessageIds.has(m.id));
    exitForwardSelectMode();
    onForwardMessage(selected);
  };

  const moveSurfaceCleanupRef = useRef<(() => void) | null>(null);

  const rowGesture = useMessageRowGesture({
    onSwipeOpenActions: (event, payload) => {
      if (forwardSelectMode) return;
      openMessageMenu(event, payload as FormattedMessage);
    },
    onSwipeBackDrag:
      isMobile && onBack
        ? (offset) => {
            if (offset > 0) swipeBack.setDragOffset(offset);
            else swipeBack.snapBack();
          }
        : undefined,
    onSwipeBack: isMobile && onBack ? (offset) => swipeBack.animateBack(offset) : undefined,
    onForwardSelectStart: (payload) => {
      enterForwardSelectMode(payload as FormattedMessage);
    },
  });

  const bindMessagesContainerRef = (node: HTMLDivElement | null) => {
    messagesContainerRef.current = node;
    if (moveSurfaceCleanupRef.current) {
      moveSurfaceCleanupRef.current();
      moveSurfaceCleanupRef.current = null;
    }
    if (node && isMobile) {
      moveSurfaceCleanupRef.current = rowGesture.attachMoveSurface(node) ?? null;
    }
  };

  useEffect(
    () => () => {
      moveSurfaceCleanupRef.current?.();
    },
    [],
  );

  useEffect(() => {
    exitForwardSelectMode();
    const node = messagesContainerRef.current;
    if (moveSurfaceCleanupRef.current) {
      moveSurfaceCleanupRef.current();
      moveSurfaceCleanupRef.current = null;
    }
    if (node && isMobile) {
      moveSurfaceCleanupRef.current = rowGesture.attachMoveSurface(node) ?? null;
    }
  }, [conversation?.id, isMobile, rowGesture.attachMoveSurface]);

  const startEditMessage = () => {
    const msg = msgMenu.message;
    if (!msg) return;
    setReplyTo(null);
    setEditingMessage(msg);
    setText(msg.content || '');
    closeMessageMenu();
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const startForwardMessage = () => {
    const msg = msgMenu.message;
    if (!msg || msg.is_deleted || !onForwardMessage) return;
    closeMessageMenu();
    onForwardMessage(msg);
  };

  const startSelectForForward = () => {
    const msg = msgMenu.message;
    if (!msg) return;
    closeMessageMenu();
    enterForwardSelectMode(msg);
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
    if (msg.file_type === 'video') return 'Видео';
    if (msg.file_type === 'document') return 'Файл';
    const text = displayMessageContent(msg as FormattedMessage).trim();
    if (isE2EContent(msg.content) && !text.startsWith('🔒')) {
      return '🔒 Сообщение';
    }
    return text.length > 80 ? `${text.slice(0, 80)}…` : text || 'Сообщение';
  };

  const openImageLightbox = async (m: FormattedMessage) => {
    const url =
      (e2eContext
        ? await resolveDecryptedMediaUrl(currentUserId, e2eContext, m.file_path, m.file_original_name, 'image/jpeg')
        : null) ?? storageDisplayUrl(m.file_path) ?? '';
    if (!url) return;
    let urls = [url];
    let index = 0;
    if (m.album_group_id) {
      const albumMsgs = messages.filter(
        (x) => x.album_group_id === m.album_group_id && effectiveMessageFileType(x) === 'image',
      );
      urls = (
        await Promise.all(
          albumMsgs.map(
            async (x) =>
              (e2eContext
                ? await resolveDecryptedMediaUrl(
                    currentUserId,
                    e2eContext,
                    x.file_path,
                    x.file_original_name,
                    'image/jpeg',
                  )
                : null) ?? storageDisplayUrl(x.file_path) ?? '',
          ),
        )
      ).filter(Boolean);
      index = Math.max(0, albumMsgs.findIndex((x) => x.id === m.id));
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
  const title = conversationTitle(conversation);

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

    if (!content && !pendingAttachments.length) return;

    const files = pendingAttachments.map((a) => a.file);
    const previewUrls = pendingAttachments
      .filter((a) => a.isImage && a.previewUrl)
      .map((a) => a.previewUrl!);
    const videoPreviewUrls = pendingAttachments
      .filter((a) => a.isVideo && a.previewUrl)
      .map((a) => a.previewUrl!);
    const replyToId = replyTo?.id;
    const clientId = crypto.randomUUID();
    const created_at = new Date().toISOString();

    for (const url of [...previewUrls, ...videoPreviewUrls]) {
      attachmentUrlsRef.current.delete(url);
    }

    setText('');
    setReplyTo(null);
    setPendingAttachments([]);
    if (fileRef.current) fileRef.current.value = '';

    const pendingItem: PendingSend = {
      clientId,
      content,
      previewUrls,
      videoPreviewUrls,
      fileCount: files.length,
      created_at,
      expectedIds: [],
      baselineMessageIds: messages.map((m) => m.id),
    };
    setPendingSends((prev) => [...prev, pendingItem]);
    stickToBottomRef.current = true;
    setSending(true);

    try {
      const ids = await onSend(content, {
        files: files.length ? files : undefined,
        replyToId,
      });
      setPendingSends((prev) =>
        prev.map((p) => (p.clientId === clientId ? { ...p, expectedIds: ids } : p)),
      );
    } catch (err) {
      setPendingSends((prev) => {
        const item = prev.find((p) => p.clientId === clientId);
        item?.previewUrls.forEach((url) => URL.revokeObjectURL(url));
        item?.videoPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
        return prev.filter((p) => p.clientId !== clientId);
      });
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
      return (
        <span className={classes.join(' ')}>
          <VellaraIcon name={status === 'sent' ? 'check' : 'checks'} size={12} />
        </span>
      );
    }

    return (
      <span className={`status-icon ${m.read_at ? 'read' : ''}`}>
        <VellaraIcon name={m.read_at ? 'checks' : 'check'} size={12} />
      </span>
    );
  };

  const renderAlbumGrid = (images: FormattedMessage[]) => {
    const count = images.length;
    const gridClass =
      count <= 1
        ? 'msg-album-grid--1'
        : count === 2
          ? 'msg-album-grid--2'
          : count === 3
            ? 'msg-album-grid--3'
            : 'msg-album-grid--4plus';

    return (
      <div className={`msg-album-grid ${gridClass}`}>
        {images.slice(0, 4).map((img, idx) => {
          return (
            <button
              key={img.id}
              type="button"
              className="msg-album-cell"
              onClick={() => void openImageLightbox(img)}
            >
              <E2EImageAttachment
                message={img}
                userId={currentUserId}
                e2eContext={e2eContext}
                isMine={img.user_id === currentUserId}
                onMediaLoad={handleMessageMediaLoad}
              />
              {count > 4 && idx === 3 && (
                <span className="msg-album-more">+{count - 4}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const renderPendingBubble = (item: PendingFeedItem) => {
    return (
      <div className="message-bubble my message-bubble--pending">
        {(item.previewUrls.length > 0 || item.videoPreviewUrls.length > 0) && (
          <div className="msg-pending-media">
            {item.previewUrls.map((url, idx) => (
              <div key={`${item.clientId}-img-${idx}`} className="msg-album-cell msg-album-cell--pending">
                <img src={url} alt="" decoding="async" />
                <div className="attachment-preview-shimmer" aria-hidden="true" />
              </div>
            ))}
            {item.videoPreviewUrls.map((url, idx) => (
              <div key={`${item.clientId}-vid-${idx}`} className="msg-video-wrap msg-video-wrap--pending">
                <video className="msg-video" src={url} muted playsInline preload="metadata" />
                <div className="attachment-preview-shimmer" aria-hidden="true" />
              </div>
            ))}
          </div>
        )}
        {item.content && <div className="msg-content">{item.content}</div>}
        <div className="msg-meta">
          <span className="msg-pending-status" aria-label="Отправка">
            <span className="msg-pending-spinner" />
          </span>
        </div>
      </div>
    );
  };

  const renderBubble = (
    m: FormattedMessage,
    mine: boolean,
    albumMessages?: FormattedMessage[],
  ) => {
    const fileType = effectiveMessageFileType(m);
    const isSystem = m.message_type === 'system';
    const voiceOnly = fileType === 'voice' && !m.content;
    const hasMedia =
      Boolean(albumMessages?.length) ||
      Boolean(
        m.file_path &&
          (fileType === 'image' || fileType === 'video') &&
          !albumMessages?.length,
      );

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
        className={`message-bubble ${mine ? 'my' : 'other'} ${hasMedia ? 'message-bubble--media' : ''} ${m.is_deleted ? 'message-bubble--deleted' : ''} ${voiceOnly ? 'voice-only' : ''}`}
      >
        {m.is_deleted ? (
          <span className="msg-deleted">Сообщение удалено</span>
        ) : (
          <>
            {m.forwarded_from && (
              <div className="msg-forward-quote">
                <VellaraIcon name="forward" size={12} className="msg-forward-quote__icon" />
                <span>Переслано от {m.forwarded_from.sender_name}</span>
              </div>
            )}
            {m.reply_to && (
              <div className="msg-reply-quote">
                <span className="msg-reply-quote__author">
                  {senderDisplayName(m.reply_to.sender)}
                </span>
                <span className="msg-reply-quote__text">{replyPreviewText(m.reply_to)}</span>
              </div>
            )}
            {albumMessages && albumMessages.length > 1
              ? renderAlbumGrid(albumMessages)
              : m.file_path && fileType === 'image' && (
                  <button
                    type="button"
                    className="msg-image-btn"
                    onClick={() => void openImageLightbox(m)}
                  >
                    <E2EImageAttachment
                      message={m}
                      userId={currentUserId}
                      e2eContext={e2eContext}
                      isMine={mine}
                      onMediaLoad={handleMessageMediaLoad}
                    />
                  </button>
                )}
            {m.file_path && fileType === 'video' && (
              <div className="msg-video-wrap">
                <E2EVideoAttachment
                  message={m}
                  userId={currentUserId}
                  e2eContext={e2eContext}
                  isMine={mine}
                  onMediaLoad={handleMessageMediaLoad}
                />
              </div>
            )}
            {m.file_path && fileType === 'voice' && (
              <E2EVoiceAttachment
                message={m}
                userId={currentUserId}
                e2eContext={e2eContext}
                isMine={mine}
              />
            )}
            {m.file_path && fileType === 'document' && (
              <E2EDocumentAttachment
                message={m}
                userId={currentUserId}
                e2eContext={e2eContext}
                isMine={mine}
              />
            )}
            {displayMessageContent(m) && (
              <div className="msg-content">{displayMessageContent(m)}</div>
            )}
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

    if (item.kind === 'pending') {
      return (
        <div key={item.key} className="message-row message-row--mine message-row--pending">
          <div className="message-row-body message-row-body--mine">
            <div className="message-row-content">{renderPendingBubble(item)}</div>
          </div>
        </div>
      );
    }

    const m = item.message;
    const albumMessages = item.albumMessages;
    const mine = m.user_id === currentUserId;
    const isSystem = m.message_type === 'system';
    const isSelected = selectedMessageIds.has(m.id);
    const isSwipeActive = rowGesture.swipeRowId === m.id;
    const swipeOffset = isSwipeActive ? rowGesture.swipeOffset : 0;
    const swipeDir = isSwipeActive ? rowGesture.swipeDirection : null;
    const canSelect = canForwardMsg(m);

    if (isSystem) {
      return (
        <div key={item.key} className="message-row message-row--system">
          {renderBubble(m, mine)}
        </div>
      );
    }

    const handleRowClick = (e: React.MouseEvent) => {
      if (!forwardSelectMode || !canSelect) return;
      if (e.target instanceof Element && e.target.closest('button, a, .msg-image-btn, audio, video')) return;
      toggleForwardSelection(m);
    };

    return (
      <div
        key={item.key}
        className={`message-row ${mine ? 'message-row--mine' : 'message-row--other'}${forwardSelectMode && canSelect ? ' message-row--selectable' : ''}${isSelected ? ' message-row--selected' : ''}${isSwipeActive && swipeDir === 'rtl' ? ' message-row--swiping-rtl' : ''}`}
        style={
          isSwipeActive && swipeDir === 'rtl'
            ? ({ '--rtl-swipe': String(swipeOffset / RTL_REVEAL_MAX) } as React.CSSProperties)
            : undefined
        }
        onClick={handleRowClick}
        onContextMenu={(e) => {
          if (forwardSelectMode) return;
          rowGesture.onContextMenu(e, m);
        }}
        onTouchStart={(e) => {
          if (forwardSelectMode) return;
          rowGesture.onTouchStart(e, m, m.id, mine);
        }}
        onTouchMove={rowGesture.onTouchMove}
        onTouchEnd={rowGesture.onTouchEnd}
        onTouchCancel={rowGesture.onTouchCancel}
      >
        {!forwardSelectMode && !isMobile && (
          <button
            type="button"
            className="message-row-action-btn"
            aria-label="Действия с сообщением"
            onClick={(e) => {
              e.stopPropagation();
              openMessageMenu(e, m);
            }}
          >
            <VellaraIcon name="more" size={16} />
          </button>
        )}
        {!forwardSelectMode && isMobile && (
          <div
            className={`message-row-actions ${mine ? 'message-row-actions--mine' : 'message-row-actions--other'}`}
            aria-hidden={swipeOffset < 8 || swipeDir !== 'rtl'}
          >
            <VellaraIcon name="more" size={18} />
          </div>
        )}
        {forwardSelectMode && canSelect && (
          <span className={`message-row-check ${isSelected ? 'message-row-check--on' : ''}`} aria-hidden="true">
            {isSelected && <VellaraIcon name="check" size={14} />}
          </span>
        )}
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
            {renderBubble(m, mine, albumMessages)}
          </div>
        </div>
      </div>
    );
  };

  const hasAttachments = pendingAttachments.length > 0;

  return (
    <section
      ref={bindChatAreaRef}
      className={`chat-area${isMobile ? ' chat-area--mobile' : ''}${!chatReady ? ' chat-area--loading' : ''}${enterAnim && !swipeBack.isDragging && !swipeBack.isClosing ? ' chat-area--enter' : ''}${swipeBack.isDragging ? ' chat-area--dragging' : ''}${swipeBack.isClosing ? ' chat-area--closing' : ''}`}
      style={swipeBack.panelStyle}
      onTransitionEnd={swipeBack.onPanelTransitionEnd}
      onTouchStart={swipeBack.handlers.onTouchStart}
      onTouchMove={swipeBack.handlers.onTouchMove}
      onTouchEnd={swipeBack.handlers.onTouchEnd}
      onTouchCancel={swipeBack.handlers.onTouchCancel}
    >
      <header className="chat-header" ref={headerRef}>
        {onBack && (
          <button
            type="button"
            className="btn-back-chat"
            aria-label="Назад к списку"
            onClick={() => swipeBack.animateBack()}
          >
            <VellaraIcon name="back" size={20} />
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

        <div className="chat-header__actions">
          {isGroup && isGroupAdmin && onOpenGroupSettings && (
            <button
              type="button"
              className="btn-group-settings"
              title="Настройки группы"
              onClick={onOpenGroupSettings}
            >
              <VellaraIcon name="settings" size={18} />
            </button>
          )}
          {onOpenChatActions && (
            <button
              type="button"
              className="btn-group-settings btn-chat-more"
              title="Действия с чатом"
              onClick={onOpenChatActions}
            >
              <VellaraIcon name="more" size={18} />
            </button>
          )}
        </div>
      </header>

      <div
        className={`messages-container${showMessages && messages.length && !scrollReady && !isMobile ? ' messages-container--preparing' : ''}`}
        ref={bindMessagesContainerRef}
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
          className={`chat-composer-dock${showEmojiPicker ? ' chat-composer-dock--emoji-open' : ''}`}
          ref={composerDockRef}
        >
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

          {showMessages && isRecording ? (
            <div className="voice-record-bar">
              <button type="button" className="btn-voice-cancel" title="Отмена" onClick={cancelRecording}>
                <VellaraIcon name="close" size={18} />
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
                {isSendingVoice ? '…' : <VellaraIcon name="upload" size={18} />}
              </button>
            </div>
          ) : showComposerArea ? (
            <>
          {showEmojiPicker && (
            <EmojiPicker isMobile={isMobile} onSelect={insertEmoji} />
          )}
            <div className="input-area input-area--ready" ref={inputAreaRef}>
          <input
            id={CHAT_FILE_INPUT_ID}
            ref={fileRef}
            type="file"
            className="composer-file-input"
            accept="image/*,video/*,.heic,.heif,.mp4,.mov,.m4v,.webm,.3gp,.pdf,.doc,.docx,.webp"
            multiple
            onChange={handleFileSelect}
            onClick={() => onFilePickerOpen?.()}
          />
          {hasAttachments && (
            <div className="attachments-panel">
              <div className="attachments-panel__head">
                <span>
                  {pendingAttachments.every((a) => a.isImage)
                    ? `Фото · ${pendingAttachments.length}`
                    : pendingAttachments.every((a) => a.isVideo)
                      ? `Видео · ${pendingAttachments.length}`
                      : `Вложения · ${pendingAttachments.length}`}
                </span>
                <button type="button" className="attachments-clear" onClick={clearAttachments}>
                  Убрать все
                </button>
              </div>
              <div className="attachments-grid">
                {pendingAttachments.map((att) => (
                  <div
                    key={att.id}
                    className={`attachment-item ${att.isImage || att.isVideo ? '' : 'attachment-item--doc'}`}
                  >
                    {att.isImage && att.previewUrl ? (
                      <>
                        <img src={att.previewUrl} alt="" className="attachment-thumb" />
                        {att.previewLoading && (
                          <div className="attachment-preview-shimmer" aria-hidden="true" />
                        )}
                      </>
                    ) : att.isVideo && att.previewUrl ? (
                      <>
                        <video
                          className="attachment-thumb attachment-thumb--video"
                          src={att.previewUrl}
                          muted
                          playsInline
                          preload="metadata"
                        />
                        {att.previewLoading && (
                          <div className="attachment-preview-shimmer" aria-hidden="true" />
                        )}
                      </>
                    ) : att.isImage || att.isVideo ? (
                      <div className="attachment-item-photo-placeholder attachment-item-photo-placeholder--loading">
                        <div className="attachment-preview-shimmer" aria-hidden="true" />
                        <VellaraIcon name={att.isVideo ? 'video' : 'image'} size={24} />
                      </div>
                    ) : (
                      <div className="attachment-doc">
                        <VellaraIcon name="document" size={20} />
                        <span className="attachment-doc-name">{att.file.name}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="attachment-remove"
                      title="Убрать"
                      onClick={() => removeAttachment(att.id)}
                    >
                      <VellaraIcon name="close" size={14} />
                    </button>
                  </div>
                ))}
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
              onClick={(e) => {
                e.stopPropagation();
                onFilePickerOpen?.();
              }}
            >
              <VellaraIcon name="attach" size={22} />
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
                    <VellaraIcon name="close" size={16} />
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
                    onTyping();
                  }}
                  onFocus={() => {
                    if (showEmojiPicker) setShowEmojiPicker(false);
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
                <VellaraIcon name="close" size={20} />
              </button>
            ) : canSendVoice && onSendVoice && !text.trim() && !hasAttachments ? (
              <button
                type="button"
                className="composer-btn composer-btn--voice"
                title="Голосовое сообщение"
                onClick={() => void startVoiceRecord()}
              >
                <VellaraIcon name="mic" size={22} />
              </button>
            ) : (
              <button
                type="submit"
                className="composer-btn composer-btn--send"
                title="Отправить"
                disabled={sending || (!editingMessage && !text.trim() && !hasAttachments)}
              >
                <VellaraIcon name="send" size={20} />
              </button>
            )}
          </form>
            </div>
            </>
          ) : null}
        </div>
      )}

      {forwardSelectMode && (
        <div className="forward-select-bar">
          <button type="button" className="forward-select-bar__btn" onClick={exitForwardSelectMode}>
            Отмена
          </button>
          <span className="forward-select-bar__count">
            Выбрано: {selectedMessageIds.size}
          </span>
          <button
            type="button"
            className="forward-select-bar__btn forward-select-bar__btn--primary"
            disabled={selectedMessageIds.size === 0}
            onClick={submitForwardSelection}
          >
            <VellaraIcon name="forward" size={16} />
            Переслать
          </button>
        </div>
      )}

      {lightbox && (
        <ImageLightbox urls={lightbox.urls} index={lightbox.index} onClose={() => setLightbox(null)} />
      )}

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
        canForward={!!msgMenu.message && !msgMenu.message.is_deleted && !!onForwardMessage}
        canSelectForForward={!!msgMenu.message && !msgMenu.message.is_deleted && !!onForwardMessage}
        onReply={startReplyMessage}
        onForward={startForwardMessage}
        onSelectForForward={startSelectForForward}
        onSave={() => void handleToggleSave()}
        onEdit={startEditMessage}
        onDelete={() => void handleDeleteMessage()}
        onClose={closeMessageMenu}
      />
    </section>
  );
}
