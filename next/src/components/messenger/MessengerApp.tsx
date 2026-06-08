'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useChatRealtime, useActiveConversationRealtime, useUserRealtime } from '@/hooks/useChatRealtime';
import { CallProvider, useCall } from '@/hooks/useCallManager';
import { ContactAvatar } from '@/components/ContactAvatar';
import { prepareChatImageForUpload } from '@/lib/chatImageUpload';
import type { ConversationListItem, FormattedMessage, Profile } from '@/lib/types';
import { applyGroupReadStatuses, type MemberRead } from '@/utils/groupReadStatus';
import {
  enrichMessageReply,
  enrichMessageSender,
  enrichMessageSenders,
  membersMapFromGroupApi,
  type SenderProfile,
} from '@/utils/messageSender';
import {
  clearConversationUnread,
  patchConversationFromMessage,
} from '@/utils/conversationList';
import { useMessageNotifications } from '@/hooks/useMessageNotifications';
import { useLastSeenHeartbeat } from '@/hooks/useLastSeenHeartbeat';
import { usePresenceRealtime } from '@/hooks/usePresenceRealtime';
import { isOnline } from '@/lib/presence';
import { CallScreen } from '@/components/CallScreen';
import { IncomingCallModal } from '@/components/IncomingCallModal';
import { ConversationSidebar } from './ConversationSidebar';
import { ChatPanel } from './ChatPanel';
import { SettingsPanel } from './SettingsPanel';
import { ContactsPanel } from './ContactsPanel';
import { CallsPanel } from './CallsPanel';
import { DashboardPanel } from './DashboardPanel';
import { FavoritesPanel } from './FavoritesPanel';
import { CreateGroupModal } from './CreateGroupModal';
import { GroupSettingsModal } from './GroupSettingsModal';
import { GroupInfoPanel } from './GroupInfoPanel';
import { UserProfilePanel } from './UserProfilePanel';
import { PushNotificationBanner } from '@/components/PushNotificationBanner';
import { useMessengerHistory } from '@/hooks/useMessengerHistory';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import {
  MOBILE_SWIPE_TABS,
  tabStep,
  type MessengerNavState,
  type MessengerTab,
} from '@/lib/messengerNav';

type Tab = MessengerTab;

const MENU_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'chats', label: 'Чаты', icon: '💬' },
  { id: 'calls', label: 'Звонки', icon: '📞' },
  { id: 'contacts', label: 'Контакты', icon: '👥' },
  { id: 'favorites', label: 'Избранное', icon: '⭐' },
  { id: 'settings', label: 'Настройки', icon: '⚙️' },
];

export function MessengerApp() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <CallProvider userId={user.id}>
      <MessengerAppInner user={user} />
    </CallProvider>
  );
}

function MessengerAppInner({ user }: { user: Profile }) {
  const {
    phase,
    mode,
    incoming,
    activeCallPeer,
    activeCallScreenVisible,
    handleCallSignaling,
    acceptIncoming,
    rejectIncoming,
    endCall,
  } = useCall();

  const signalingRef = useRef(handleCallSignaling);
  signalingRef.current = handleCallSignaling;

  const onCallSignaling = useCallback((payload: unknown) => {
    signalingRef.current(payload);
  }, []);

  const [contactsRefreshKey, setContactsRefreshKey] = useState(0);
  const refreshIncomingCount = useCallback(async () => {
    try {
      const inc = await api<unknown[]>('/api/contacts/incoming');
      setIncomingContactCount(inc.length);
    } catch {
      setIncomingContactCount(0);
    }
  }, []);

  const onContactsChanged = useCallback(() => {
    setContactsRefreshKey((k) => k + 1);
    refreshIncomingCount();
  }, [refreshIncomingCount]);

  useEffect(() => {
    refreshIncomingCount();
  }, [refreshIncomingCount]);

  useUserRealtime(user.id, {
    onCallSignaling,
    onContactsChanged,
  });

  const [tab, setTab] = useState<Tab>('chats');
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<FormattedMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [membersRead, setMembersRead] = useState<MemberRead[]>([]);
  const [savedMessageIds, setSavedMessageIds] = useState<Set<number>>(new Set());
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileInContacts, setProfileInContacts] = useState(false);
  const [contactsForGroup, setContactsForGroup] = useState<{ id: string; name: string; last_name: string }[]>([]);
  const [incomingContactCount, setIncomingContactCount] = useState(0);
  const [toast, setToast] = useState('');
  const [tabAnim, setTabAnim] = useState<'left' | 'right' | null>(null);
  const [chatEnterAnim, setChatEnterAnim] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const suppressTabSwipeUntilRef = useRef(0);
  const prevActiveIdRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const navStateRef = useRef<MessengerNavState>({
    tab: 'chats',
    activeId: null,
    profileUserId: null,
    showGroupSettings: false,
    showGroupPanel: false,
    showCreateGroup: false,
  });

  navStateRef.current = {
    tab,
    activeId,
    profileUserId,
    showGroupSettings,
    showGroupPanel,
    showCreateGroup,
  };

  const applyNavState = useCallback((state: MessengerNavState) => {
    setTab(state.tab);
    setActiveId(state.activeId);
    setProfileUserId(state.profileUserId);
    setShowGroupSettings(state.showGroupSettings);
    setShowGroupPanel(state.showGroupPanel);
    setShowCreateGroup(state.showCreateGroup);
  }, []);

  const { navigate, goBack } = useMessengerHistory({
    isMobile,
    getState: () => navStateRef.current,
    applyState: applyNavState,
  });

  const closeChat = useCallback(() => {
    suppressTabSwipeUntilRef.current = Date.now() + 600;
    navigate(() => {
      setActiveId(null);
      setTab('chats');
    }, 'replace');
  }, [navigate]);

  useEffect(() => {
    if (!isMobile) {
      prevActiveIdRef.current = activeId;
      return;
    }
    if (activeId != null && prevActiveIdRef.current == null) {
      setChatEnterAnim(true);
      const timer = window.setTimeout(() => setChatEnterAnim(false), 440);
      prevActiveIdRef.current = activeId;
      return () => window.clearTimeout(timer);
    }
    prevActiveIdRef.current = activeId;
    if (activeId == null) setChatEnterAnim(false);
  }, [activeId, isMobile]);

  const canSwipeTabs =
    isMobile &&
    !activeId &&
    !profileUserId &&
    tab !== 'settings' &&
    tab !== 'dashboard' &&
    !showGroupSettings &&
    !showGroupPanel &&
    !showCreateGroup;

  const switchTab = useCallback(
    (next: Tab, direction: 'left' | 'right', history: 'push' | 'replace' = 'push') => {
      if (isMobile) {
        setTabAnim(direction);
        window.setTimeout(() => setTabAnim(null), 420);
      }
      navigate(() => setTab(next), history);
    },
    [navigate, isMobile],
  );

  const tabSwipe = useSwipeGesture({
    enabled: canSwipeTabs,
    threshold: 52,
    onSwipeLeft: () => {
      if (Date.now() < suppressTabSwipeUntilRef.current) return;
      const next = tabStep(tab, 1);
      if (next) switchTab(next, 'left');
    },
    onSwipeRight: () => {
      if (Date.now() < suppressTabSwipeUntilRef.current) return;
      const next = tabStep(tab, -1);
      if (next) switchTab(next, 'right');
    },
  });

  const edgeBackSwipe = useSwipeGesture({
    enabled:
      isMobile &&
      (Boolean(profileUserId) || tab === 'settings' || tab === 'dashboard'),
    edgeWidth: 36,
    threshold: 64,
    onSwipeRight: () => goBack(),
  });

  useLastSeenHeartbeat(true);

  const presenceUserIds = useMemo(
    () =>
      [
        ...new Set(
          conversations
            .filter((c) => c.type !== 'group' && c.other_user?.id)
            .map((c) => c.other_user!.id),
        ),
      ],
    [conversations],
  );

  usePresenceRealtime(presenceUserIds, (userId, lastSeenAt) => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.other_user?.id !== userId || !c.other_user) return c;
        return {
          ...c,
          other_user: {
            ...c.other_user,
            last_seen_at: lastSeenAt,
            is_online: isOnline(lastSeenAt),
          },
        };
      }),
    );
  });

  const activeIdRef = useRef<number | null>(null);
  const tabRef = useRef<Tab>('chats');
  const conversationsRef = useRef(conversations);
  const groupMembersRef = useRef<Map<string, SenderProfile>>(new Map());
  const userRef = useRef(user);
  const membersReadRef = useRef(membersRead);
  const typingTimeoutRef = useRef<number | null>(null);
  activeIdRef.current = activeId;
  tabRef.current = tab;
  conversationsRef.current = conversations;
  userRef.current = user;
  membersReadRef.current = membersRead;

  const {
    notification: messageNotification,
    notifyIncomingMessage,
    dismissNotification,
    syncConversations,
  } = useMessageNotifications();

  const isViewingConversation = useCallback((convId: number) => {
    return (
      tabRef.current === 'chats' &&
      activeIdRef.current === convId &&
      document.visibilityState === 'visible'
    );
  }, []);

  const setConversationReadLocal = useCallback((convId: number) => {
    setConversations((prev) => clearConversationUnread(prev, convId));
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3500);
  }, []);

  const chatOpen = isMobile && activeId != null;
  const hideMobileNav = tab === 'chats' && (chatOpen || profileUserId != null);

  const navItems = useMemo(
    () => (isMobile ? MENU_ITEMS.filter((item) => item.id !== 'settings') : MENU_ITEMS),
    [isMobile],
  );

  useEffect(() => {
    setShowGroupPanel(false);
    setShowGroupSettings(false);
    setProfileUserId(null);
  }, [activeId]);

  useEffect(() => {
    if (!profileUserId) {
      setProfileInContacts(false);
      return;
    }
    api<{ id: string }[]>('/api/contacts/my')
      .then((list) => setProfileInContacts(list.some((c) => c.id === profileUserId)))
      .catch(() => setProfileInContacts(false));
  }, [profileUserId, contactsRefreshKey]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.is_archived ? 0 : c.unread_count ?? 0), 0),
    [conversations],
  );

  const unreadBadge = totalUnread > 99 ? '99+' : totalUnread > 0 ? String(totalUnread) : '';

  const loadConversations = useCallback(async () => {
    const data = await api<ConversationListItem[]>('/api/chat');
    setConversations(data);
    syncConversations(data);
    return data;
  }, [syncConversations]);

  const loadSavedIds = useCallback(async () => {
    try {
      const data = await api<{ ids: number[] }>('/api/chat/messages/saved/ids');
      setSavedMessageIds(new Set((data.ids ?? []).map(Number)));
    } catch {
      setSavedMessageIds(new Set());
    }
  }, []);

  const applyGroupRead = useCallback(
    (msgs: FormattedMessage[], readState: MemberRead[], convId: number | null) => {
      const conv = conversationsRef.current.find((c) => c.id === convId);
      if (conv?.type !== 'group') return msgs;
      const enriched = enrichMessageSenders(msgs, groupMembersRef.current, userRef.current);
      return applyGroupReadStatuses(enriched, readState, userRef.current.id);
    },
    [],
  );

  const syncGroupMembers = useCallback(async (convId: number) => {
    const conv = conversationsRef.current.find((c) => c.id === convId);
    if (conv?.type !== 'group') {
      groupMembersRef.current = new Map();
      return null;
    }
    try {
      const data = await api<{
        members: Array<{
          id: string;
          name: string;
          last_name: string;
          avatar: string | null;
          last_read_at?: string | null;
        }>;
        members_count?: number;
        title?: string | null;
        allow_voice_messages?: boolean;
      }>(`/api/chat/groups/${convId}`);
      groupMembersRef.current = membersMapFromGroupApi(data.members ?? []);
      setMembersRead(
        (data.members ?? []).map((m) => ({
          user_id: m.id,
          last_read_at: m.last_read_at ?? null,
        })),
      );
      setConversations((prev) => {
        const current = prev.find((c) => c.id === convId);
        if (!current) return prev;
        const nextTitle = data.title ?? current.title;
        const nextCount = data.members_count ?? current.members_count;
        const nextVoice =
          data.allow_voice_messages !== undefined
            ? data.allow_voice_messages
            : current.allow_voice_messages;
        if (
          current.title === nextTitle &&
          current.members_count === nextCount &&
          current.allow_voice_messages === nextVoice
        ) {
          return prev;
        }
        return prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                title: nextTitle,
                members_count: nextCount,
                allow_voice_messages: nextVoice,
              }
            : c,
        );
      });
      return data;
    } catch {
      return null;
    }
  }, []);

  const loadMessages = useCallback(
    async (convId: number, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setMessagesLoading(true);
      setConversationReadLocal(convId);
      const conv = conversationsRef.current.find((c) => c.id === convId);
      if (conv?.type === 'group') {
        await syncGroupMembers(convId);
      } else {
        groupMembersRef.current = new Map();
      }
      try {
        const data = await api<{
          messages: FormattedMessage[];
          members_read: MemberRead[];
          has_more?: boolean;
        }>(`/api/chat/${convId}/messages`);
        const readState =
          conv?.type === 'group' && groupMembersRef.current.size
            ? [...groupMembersRef.current.keys()].map((userId) => {
                const fromApi = (data.members_read ?? []).find((m) => m.user_id === userId);
                return { user_id: userId, last_read_at: fromApi?.last_read_at ?? null };
              })
            : (data.members_read ?? []);
        setMembersRead(readState);
        const enriched = enrichMessageSenders(data.messages ?? [], groupMembersRef.current, userRef.current);
        const nextMessages = applyGroupReadStatuses(enriched, readState, userRef.current.id);
        setHasMoreOlder(data.has_more ?? (nextMessages.length >= 50));
        setMessages((prev) => {
          if (!opts?.silent || prev.length === 0) return nextMessages;
          const prevLast = prev[prev.length - 1]?.id ?? 0;
          const nextLast = nextMessages[nextMessages.length - 1]?.id ?? 0;
          if (nextLast < prevLast) return prev;
          if (nextLast === prevLast && prev.length >= nextMessages.length) return prev;
          return nextMessages;
        });
        api(`/api/chat/${convId}/messages/read`, { method: 'POST' }).catch(() => {});
      } finally {
        if (!opts?.silent) setMessagesLoading(false);
      }
    },
    [setConversationReadLocal, syncGroupMembers],
  );

  const loadOlderMessages = useCallback(async () => {
    const convId = activeIdRef.current;
    if (!convId || loadingOlder || !hasMoreOlder) return;
    let firstId: number | null = null;
    setMessages((prev) => {
      firstId = prev[0]?.id ?? null;
      return prev;
    });
    if (!firstId) return;
    setLoadingOlder(true);
    try {
      const data = await api<{
        messages: FormattedMessage[];
        has_more?: boolean;
      }>(`/api/chat/${convId}/messages?before_id=${firstId}&limit=50`);
      const enriched = enrichMessageSenders(data.messages ?? [], groupMembersRef.current, userRef.current);
      const readState = membersRead;
      const older = applyGroupReadStatuses(enriched, readState, userRef.current.id);
      setHasMoreOlder(data.has_more ?? older.length >= 50);
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const prepend = older.filter((m) => !seen.has(m.id));
        if (!prepend.length) return prev;
        return [...prepend, ...prev];
      });
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMoreOlder, loadingOlder, membersRead]);

  useEffect(() => {
    loadConversations()
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [loadConversations, user.id]);

  const openChatFromPath = useCallback((path: string) => {
    try {
      const url = new URL(path, window.location.origin);
      const chat = url.searchParams.get('chat');
      if (!chat) return;
      const id = Number(chat);
      if (!Number.isFinite(id) || id <= 0) return;
      navigate(() => {
        setActiveId(id);
        setTab('chats');
      }, 'replace');
    } catch {
      /* ignore malformed notification url */
    }
  }, [navigate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    openChatFromPath(window.location.pathname + window.location.search);
  }, [openChatFromPath]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type === 'notification-open' && data.url) {
        openChatFromPath(data.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [openChatFromPath]);

  useEffect(() => {
    loadSavedIds();
  }, [loadSavedIds]);

  useEffect(() => {
    if (activeId) {
      setMessages([]);
      setHasMoreOlder(false);
      setMessagesLoading(true);
      loadMessages(activeId);
    } else {
      setMessages([]);
      setMembersRead([]);
      setHasMoreOlder(false);
      setMessagesLoading(false);
    }
  }, [activeId, loadMessages]);

  useEffect(() => {
    syncConversations(conversations);
  }, [conversations, syncConversations]);

  const realtimeConvIdsKey = useMemo(() => {
    const ids = conversations.map((c) => c.id);
    if (ids.length === 0) return '';
    return [...ids].sort((a, b) => a - b).join(',');
  }, [conversations]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadConversations().catch(() => {});
        if (activeIdRef.current) {
          loadMessages(activeIdRef.current).catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadConversations, loadMessages]);

  useEffect(() => {
    if (!activeId || tab !== 'chats') return;
    const pollMessages = () => {
      if (document.visibilityState !== 'visible') return;
      loadMessages(activeId, { silent: true }).catch(() => {});
    };
    const messageTimer = window.setInterval(pollMessages, 12000);
    return () => window.clearInterval(messageTimer);
  }, [activeId, tab, loadMessages]);

  useEffect(() => {
    const pollConversations = () => {
      if (document.visibilityState !== 'visible') return;
      loadConversations().catch(() => {});
    };
    const listTimer = window.setInterval(pollConversations, 15000);
    return () => window.clearInterval(listTimer);
  }, [loadConversations]);

  const handleListRealtimeMessage = useCallback(
    (msg: FormattedMessage) => {
      const convId = msg.conversation_id;
      if (!convId) return;

      const fromOther = msg.user_id !== user.id;
      const isSystem = (msg.message_type || 'user') === 'system';
      const viewing = isViewingConversation(convId);

      setConversations((prev) => {
        if (!prev.some((c) => c.id === convId)) {
          loadConversations().catch(() => {});
          return prev;
        }
        return patchConversationFromMessage(prev, convId, msg, {
          incrementUnread: fromOther && !viewing && !isSystem,
          currentUserId: user.id,
        });
      });

      if (viewing && activeIdRef.current === convId) {
        setMessages((prev) => {
          const enriched = enrichMessageReply(
            enrichMessageSender(msg, groupMembersRef.current, userRef.current),
            prev,
          );
          if (prev.some((m) => m.id === enriched.id)) return prev;
          return applyGroupRead([...prev, enriched], membersReadRef.current, convId);
        });
        api(`/api/chat/${convId}/messages/read`, { method: 'POST' }).catch(() => {});
        setConversationReadLocal(convId);
        return;
      }

      if (fromOther && !isSystem && !viewing) {
        notifyIncomingMessage(msg);
      }
    },
    [
      user.id,
      isViewingConversation,
      loadConversations,
      notifyIncomingMessage,
      setConversationReadLocal,
    ],
  );

  useChatRealtime(realtimeConvIdsKey, {
    onMessage: handleListRealtimeMessage,
  });

  useActiveConversationRealtime(activeId, {
    onMessage: (msg) => {
      if (msg.conversation_id !== activeIdRef.current) return;
      handleListRealtimeMessage(msg);
    },
    onMessageUpdate: (msg) => {
      const convId = activeIdRef.current;
      if (!convId || msg.conversation_id !== convId) return;
      const enriched = enrichMessageSender(msg, groupMembersRef.current, userRef.current);
      setMessages((prev) => {
        const next = prev.map((m) => {
          if (m.id !== enriched.id) return m;
          return {
            ...m,
            ...enriched,
            read_at: enriched.read_at ?? m.read_at,
            sender: enriched.sender ?? m.sender,
          };
        });
        return applyGroupRead(next, membersReadRef.current, convId);
      });
    },
    onTyping: (data) => {
      if (data.conversation_id !== activeIdRef.current) return;
      setTypingUserId(data.user_id);
      if (typingTimeoutRef.current != null) {
        window.clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = window.setTimeout(() => {
        setTypingUserId(null);
        typingTimeoutRef.current = null;
      }, 2500);
    },
    onMemberRead: (data) => {
      if (data.conversation_id !== activeIdRef.current) return;
      setMembersRead((prev) => {
        const next = prev.map((m) =>
          m.user_id === data.user_id ? { ...m, last_read_at: data.last_read_at } : m,
        );
        if (!next.some((m) => m.user_id === data.user_id)) {
          next.push({ user_id: data.user_id, last_read_at: data.last_read_at });
        }
        setMessages((msgs) => applyGroupRead(msgs, next, activeIdRef.current!));
        return next;
      });
    },
  });

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  const sendMessage = async (text: string, file?: File, replyToId?: number) => {
    if (!activeId) return;
    const uploadFile = file ? await prepareChatImageForUpload(file) : file;
    const form = new FormData();
    if (text) form.append('content', text);
    if (uploadFile) form.append('file', uploadFile);
    if (replyToId) form.append('reply_to_id', String(replyToId));
    const msg = await api<FormattedMessage>(`/api/chat/${activeId}/messages`, {
      method: 'POST',
      body: form,
      headers: {},
    });
    setMessages((prev) => {
      const enriched = enrichMessageReply(
        enrichMessageSender(msg, groupMembersRef.current, user),
        prev,
      );
      if (prev.some((m) => m.id === enriched.id)) return prev;
      return applyGroupRead([...prev, enriched], membersRead, activeId);
    });
    await loadConversations();
  };

  const sendVoiceMessage = async (blob: Blob, duration: number, mimeType: string) => {
    if (!activeId) return;
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
    const form = new FormData();
    form.append('file', blob, `voice.${ext}`);
    form.append('voice_duration', String(duration));
    const msg = await api<FormattedMessage>(`/api/chat/${activeId}/messages`, {
      method: 'POST',
      body: form,
      headers: {},
    });
    const enriched = enrichMessageSender(msg, groupMembersRef.current, user);
    setMessages((prev) => {
      if (prev.some((m) => m.id === enriched.id)) return prev;
      return applyGroupRead([...prev, enriched], membersRead, activeId);
    });
    await loadConversations();
  };

  const editMessage = async (messageId: number, content: string) => {
    const updated = enrichMessageSender(
      await api<FormattedMessage>(`/api/chat/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }),
      groupMembersRef.current,
      user,
    );
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === updated.id ? { ...m, ...updated, sender: updated.sender ?? m.sender } : m));
      return applyGroupRead(next, membersRead, activeId);
    });
  };

  const deleteMessage = async (messageId: number) => {
    const updated = enrichMessageSender(
      await api<FormattedMessage>(`/api/chat/messages/${messageId}`, {
        method: 'DELETE',
      }),
      groupMembersRef.current,
      user,
    );
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m));
      return applyGroupRead(next, membersRead, activeId);
    });
  };

  const toggleSaveMessage = async (messageId: number) => {
    const data = await api<{ saved: boolean }>(`/api/chat/messages/${messageId}/save`, {
      method: 'POST',
    });
    setSavedMessageIds((prev) => {
      const next = new Set(prev);
      if (data.saved) next.add(messageId);
      else next.delete(messageId);
      return next;
    });
  };

  const sendTyping = () => {
    if (!activeId) return;
    api(`/api/chat/${activeId}/typing`, { method: 'POST' }).catch(() => {});
  };

  return (
    <div className="app-shell">
      <aside className={`side-menu ${hideMobileNav ? 'side-menu--hidden-mobile' : ''}`}>
        <header className="side-menu__brand">
          <span className="brand-mark" aria-hidden="true">V</span>
          <div className="brand-text">
            <span className="brand-name">Vellara</span>
            <span className="brand-tagline">Messenger</span>
          </div>
        </header>

        <p className="side-menu__section-label">Навигация</p>
        <nav className="side-menu__nav" aria-label="Основное меню">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${tab === item.id ? 'active' : ''}`}
              onClick={() => {
                if (item.id === tab) return;
                const currIdx = MOBILE_SWIPE_TABS.indexOf(tab);
                const nextIdx = MOBILE_SWIPE_TABS.indexOf(item.id);
                const direction: 'left' | 'right' =
                  currIdx >= 0 && nextIdx >= 0 && nextIdx < currIdx ? 'right' : 'left';
                switchTab(item.id, direction);
              }}
            >
              <span className="nav-item__icon-wrap">
                <span className="nav-item__icon" aria-hidden="true">{item.icon}</span>
                {item.id === 'chats' && unreadBadge && (
                  <span className="nav-item__badge">{unreadBadge}</span>
                )}
                {item.id === 'contacts' && incomingContactCount > 0 && (
                  <span className="nav-item__badge">{incomingContactCount}</span>
                )}
              </span>
              <span className="nav-item__label">{item.label}</span>
              {tab === item.id && <span className="nav-item__indicator" aria-hidden="true" />}
            </button>
          ))}
        </nav>

        <div className="side-menu__spacer" />

        <button
          type="button"
          className={`account-card ${tab === 'dashboard' || tab === 'settings' ? 'active' : ''}`}
          aria-label="Профиль и настройки"
          onClick={() => navigate(() => setTab('dashboard'), 'push')}
        >
          <div className="account-card__avatar-wrap">
            <ContactAvatar
              name={user.name}
              lastName={user.last_name}
              avatar={user.avatar}
              size="sm"
            />
            <span className="account-card__online" aria-hidden="true" />
          </div>
          <div className="account-card__info">
            <span className="account-card__name">{user.name} {user.last_name}</span>
            <span className="account-card__hint">Профиль и настройки</span>
          </div>
          <span className="account-card__chevron" aria-hidden="true">›</span>
        </button>
      </aside>

      <main className="messenger">
        <div
          className={`messenger-view${tabAnim ? ` messenger-view--slide-${tabAnim}` : ''}`}
          {...(canSwipeTabs
            ? tabSwipe
            : isMobile &&
                (Boolean(profileUserId) || tab === 'settings' || tab === 'dashboard')
              ? edgeBackSwipe
              : {})}
        >
          <div
            key={`${tab}-${profileUserId ?? 'none'}`}
            className="messenger-view__panel"
          >
          {tab === 'chats' && profileUserId ? (
            <div className="chat-profile-view">
              <UserProfilePanel
                userId={profileUserId}
                isInContacts={profileInContacts}
                onBack={() => goBack()}
                onAddToContacts={async () => {
                  await api('/api/contacts/send', {
                    method: 'POST',
                    body: JSON.stringify({ contact_id: profileUserId }),
                  });
                  onContactsChanged();
                  showToast('Заявка отправлена');
                  setProfileUserId(null);
                }}
                onStartChat={async (uid) => {
                  try {
                    const res = await api<{ id: number }>(`/api/chat/start/${uid}`);
                    await loadConversations();
                    navigate(() => {
                      setProfileUserId(null);
                      setActiveId(res.id);
                    }, 'push');
                  } catch (e) {
                    showToast(e instanceof Error ? e.message : 'Не удалось открыть чат');
                  }
                }}
                onOpenSettings={() => navigate(() => setTab('settings'), 'push')}
              />
            </div>
          ) : tab === 'chats' ? (
            <div className={`chat-layout ${chatOpen ? 'chat-open' : ''}`}>
              <ConversationSidebar
                conversations={conversations}
                activeId={activeId}
                loading={loading}
                onSelect={(id) => navigate(() => setActiveId(id), 'push')}
                onRefresh={loadConversations}
                onCreateGroup={async () => {
                  const list = await api<{ id: string; name: string; last_name: string }[]>('/api/contacts/my');
                  setContactsForGroup(list);
                  navigate(() => setShowCreateGroup(true), 'push');
                }}
              />
              {activeId ? (
                <ChatPanel
                  conversation={activeConv}
                  messages={messages}
                  messagesLoading={messagesLoading}
                  hasMoreOlder={hasMoreOlder}
                  loadingOlder={loadingOlder}
                  onLoadOlder={loadOlderMessages}
                  currentUserId={user.id}
                  typingUserId={typingUserId}
                  savedMessageIds={savedMessageIds}
                  isMobile={isMobile}
                  enterAnim={chatEnterAnim}
                  onSend={sendMessage}
                  onSendVoice={sendVoiceMessage}
                  onEditMessage={editMessage}
                  onDeleteMessage={deleteMessage}
                  onToggleSave={toggleSaveMessage}
                  onTyping={sendTyping}
                  onOpenGroupInfo={
                    activeConv?.type === 'group'
                      ? () => navigate(() => setShowGroupPanel(true), 'push')
                      : undefined
                  }
                  onOpenPartnerProfile={
                    activeConv?.type !== 'group' && activeConv?.other_user?.id
                      ? () =>
                          navigate(() => setProfileUserId(activeConv.other_user!.id), 'push')
                      : undefined
                  }
                  onOpenGroupSettings={
                    activeConv?.type === 'group' && activeConv.my_role === 'admin'
                      ? () => navigate(() => setShowGroupSettings(true), 'push')
                      : undefined
                  }
                  onBack={isMobile ? closeChat : undefined}
                />
              ) : (
                !isMobile && (
                  <div className="chat-placeholder">Выберите диалог или начните новый</div>
                )
              )}
            </div>
          ) : tab === 'contacts' ? (
            <ContactsPanel
              contactsRefreshKey={contactsRefreshKey}
              onStartChat={async (contactId) => {
                try {
                  const res = await api<{ id: number }>(`/api/chat/start/${contactId}`);
                  await loadConversations();
                  navigate(() => {
                    setActiveId(res.id);
                    setTab('chats');
                  }, 'push');
                } catch (e) {
                  showToast(e instanceof Error ? e.message : 'Не удалось открыть чат');
                }
              }}
            />
          ) : tab === 'calls' ? (
            <CallsPanel />
          ) : tab === 'favorites' ? (
            <FavoritesPanel />
          ) : tab === 'settings' ? (
            <SettingsPanel
              showMobileBack={isMobile}
              onBack={() => goBack()}
            />
          ) : tab === 'dashboard' ? (
            <DashboardPanel onOpenSettings={() => navigate(() => setTab('settings'), 'push')} />
          ) : null}
          </div>
        </div>
      </main>

      {showCreateGroup && (
        <CreateGroupModal
          contacts={contactsForGroup}
          onClose={() => goBack()}
          onCreated={async (id) => {
            await loadConversations();
            navigate(() => {
              setActiveId(id);
              setTab('chats');
            }, 'replace');
          }}
        />
      )}
      {showGroupPanel && activeId && (
        <GroupInfoPanel
          conversationId={activeId}
          currentUserId={user.id}
          onClose={() => goBack()}
          onUpdated={async (payload) => {
            if (payload?.title) {
              setConversations((prev) =>
                prev.map((c) => (c.id === activeId ? { ...c, title: payload.title! } : c)),
              );
            } else {
              loadConversations();
            }
            await syncGroupMembers(activeId);
            setMessages((prev) =>
              applyGroupRead(
                enrichMessageSenders(prev, groupMembersRef.current, user),
                membersRead,
                activeId,
              ),
            );
          }}
          onLeft={() => {
            navigate(() => {
              setShowGroupPanel(false);
              setActiveId(null);
            }, 'replace');
            loadConversations();
          }}
        />
      )}
      {showGroupSettings && activeId && (
        <GroupSettingsModal
          conversationId={activeId}
          onClose={() => goBack()}
          onSaved={({ allow_voice_messages }) => {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === activeId ? { ...c, allow_voice_messages } : c,
              ),
            );
          }}
        />
      )}

      {phase === 'incoming' && (
        <IncomingCallModal
          caller={incoming?.caller ?? null}
          isVideo={incoming?.type === 'video'}
          onAccept={() => acceptIncoming().catch(() => {})}
          onReject={() => rejectIncoming()}
        />
      )}

      {activeCallScreenVisible && (
        <CallScreen
          phase={phase}
          peer={activeCallPeer}
          isVideo={mode === 'video'}
          onAccept={() => acceptIncoming().catch(() => {})}
          onReject={() => rejectIncoming()}
          onHangup={() => endCall()}
        />
      )}

      <PushNotificationBanner />

      {toast && <div className="contacts-toast">{toast}</div>}

      {messageNotification && (
        <button
          type="button"
          className="msg-notification"
          onClick={() => {
            dismissNotification();
            navigate(() => {
              setTab('chats');
              setActiveId(messageNotification.conversationId);
            }, 'push');
          }}
        >
          <span className="msg-notification__icon">💬</span>
          <span className="msg-notification__body">
            <strong>{messageNotification.title}</strong>
            <span>{messageNotification.body}</span>
          </span>
        </button>
      )}
    </div>
  );
}
