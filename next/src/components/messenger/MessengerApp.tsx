'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useChatRealtime, useActiveConversationRealtime, useUserRealtime } from '@/hooks/useChatRealtime';
import { CallProvider, useCall } from '@/hooks/useCallManager';
import { ContactAvatar } from '@/components/ContactAvatar';
import {
  appendPreparedFileToForm,
  prepareMessageFileForSend,
} from '@/lib/chat/messageFileUpload';
import type { ConversationKeyContext } from '@/lib/crypto/conversationKey';
import { buildE2EFileTransform } from '@/lib/e2e/fileTransform';
import {
  buildE2EContextFromConversation,
  decryptMessagesForConversation,
  encryptOutgoingText,
} from '@/lib/e2e/messageCrypto';
import { buildForwardReencryptUpdates } from '@/lib/e2e/reencryptForward';
import { useE2EInit } from '@/hooks/useE2EInit';
import { E2ERecoveryModal } from '@/components/messenger/E2ERecoveryModal';
import { ensureIdentityKeys } from '@/lib/crypto/identity';
import type { SendMessageOptions } from '@/lib/chat/sendMessage';
import { readCachedMessages, writeCachedMessages } from '@/lib/chat/messageCache';
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
  sortConversations,
} from '@/utils/conversationList';
import { enrichConversationListPreviews } from '@/utils/conversationPreview';
import { displayFullName } from '@/utils/formatName';
import { ConversationActionsMenu } from './ConversationActionsMenu';
import { useMessageNotifications } from '@/hooks/useMessageNotifications';
import { useLastSeenHeartbeat } from '@/hooks/useLastSeenHeartbeat';
import { usePushActivePing } from '@/hooks/usePushActivePing';
import { usePresenceRealtime } from '@/hooks/usePresenceRealtime';
import { useRealtimeInit } from '@/hooks/useRealtimeInit';
import { useRealtimeMessageReducer } from '@/hooks/useRealtimeMessageReducer';
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
import { CreateChannelModal } from './CreateChannelModal';
import { CreateGroupModal } from './CreateGroupModal';
import { ChannelInfoPanel } from './ChannelInfoPanel';
import { ChannelSettingsModal } from './ChannelSettingsModal';
import { ForwardDestinationModal } from './ForwardDestinationModal';
import { GroupSettingsModal } from './GroupSettingsModal';
import { GroupInfoPanel } from './GroupInfoPanel';
import { UserProfilePanel } from './UserProfilePanel';
import { PushNotificationBanner } from '@/components/PushNotificationBanner';
import { VellaraIcon, type VellaraIconName } from '@/components/icons/VellaraIcon';
import { useMessengerHistory } from '@/hooks/useMessengerHistory';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import {
  MOBILE_SWIPE_TABS,
  tabStep,
  type MessengerNavState,
  type MessengerTab,
} from '@/lib/messengerNav';

type Tab = MessengerTab;

const REALTIME_LIST_CONV_LIMIT = 40;

const MENU_ITEMS: { id: Tab; label: string; icon: VellaraIconName }[] = [
  { id: 'chats', label: 'Чаты', icon: 'chats' },
  { id: 'calls', label: 'Звонки', icon: 'calls' },
  { id: 'contacts', label: 'Контакты', icon: 'contacts' },
  { id: 'favorites', label: 'Избранное', icon: 'favorites' },
  { id: 'settings', label: 'Настройки', icon: 'settings' },
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
  const { e2eStatus, e2eError, restoreE2E } = useE2EInit(user.id);
  const e2eStatusRef = useRef(e2eStatus);

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
  const incomingContactCountRef = useRef(0);

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
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [forwardPayload, setForwardPayload] = useState<{
    messages: FormattedMessage[];
    excludeConversationId: number | null;
  } | null>(null);
  const [convActionsMenu, setConvActionsMenu] = useState<{
    conv: ConversationListItem;
    x: number;
    y: number;
  } | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileInContacts, setProfileInContacts] = useState(false);
  const [contactsForGroup, setContactsForGroup] = useState<
    { id: string; name: string; last_name: string; email?: string; avatar?: string | null }[]
  >([]);
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
    showCreateChannel: false,
  });

  navStateRef.current = {
    tab,
    activeId,
    profileUserId,
    showGroupSettings,
    showGroupPanel,
    showCreateGroup,
    showCreateChannel,
  };

  const applyNavState = useCallback((state: MessengerNavState) => {
    navStateRef.current = state;
    setTab(state.tab);
    setActiveId(state.activeId);
    setProfileUserId(state.profileUserId);
    setShowGroupSettings(state.showGroupSettings);
    setShowGroupPanel(state.showGroupPanel);
    setShowCreateGroup(state.showCreateGroup);
    setShowCreateChannel(state.showCreateChannel);
  }, []);

  const { navigate, goBack } = useMessengerHistory({
    isMobile,
    getState: () => navStateRef.current,
    applyState: applyNavState,
  });

  const closeChat = useCallback(() => {
    suppressTabSwipeUntilRef.current = Date.now() + 600;
    navigate({ activeId: null, tab: 'chats' }, 'replace');
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
    !showCreateGroup &&
    !showCreateChannel;

  const switchTab = useCallback(
    (next: Tab, direction: 'left' | 'right', history: 'push' | 'replace' = 'push') => {
      if (isMobile) {
        setTabAnim(direction);
        window.setTimeout(() => setTabAnim(null), 420);
      }
      navigate({ tab: next }, history);
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
  usePushActivePing(true);
  useRealtimeInit(user.id);

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
  const messagesRef = useRef(messages);
  const groupMembersRef = useRef<Map<string, SenderProfile>>(new Map());
  const userRef = useRef(user);
  const membersReadRef = useRef(membersRead);
  const typingTimeoutRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);
  const loadMessagesRef = useRef<
    (convId: number, opts?: { silent?: boolean; fromCache?: boolean }) => Promise<void>
  >(async () => {});
  const filePickerGraceUntilRef = useRef(0);
  const visibilityRefreshTimerRef = useRef<number | null>(null);
  activeIdRef.current = activeId;
  tabRef.current = tab;
  conversationsRef.current = conversations;
  messagesRef.current = messages;
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

  const refreshIncomingCount = useCallback(async () => {
    try {
      const inc = await api<{ name: string; last_name: string }[]>('/api/contacts/incoming');
      const nextCount = inc.length;
      const changed = incomingContactCountRef.current !== nextCount;
      incomingContactCountRef.current = nextCount;
      setIncomingContactCount(nextCount);
      if (changed) {
        setContactsRefreshKey((k) => k + 1);
      }
    } catch {
      const changed = incomingContactCountRef.current !== 0;
      incomingContactCountRef.current = 0;
      setIncomingContactCount(0);
      if (changed) {
        setContactsRefreshKey((k) => k + 1);
      }
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3500);
  }, []);

  const onContactRequest = useCallback(
    (payload: { name?: string; last_name?: string }) => {
      const who = displayFullName(payload.name ?? '', payload.last_name ?? '', 'Пользователь');
      showToast(`${who} отправил заявку в контакты`);
      setContactsRefreshKey((k) => k + 1);
      void refreshIncomingCount();
    },
    [refreshIncomingCount, showToast],
  );

  const onContactsChanged = useCallback(() => {
    setContactsRefreshKey((k) => k + 1);
    void refreshIncomingCount();
    // Contact accept can create a brand-new private conversation.
    // Refresh chat list immediately so first message arrives in realtime.
    void api<ConversationListItem[]>('/api/chat')
      .then((data) => {
        setConversations(data);
        syncConversations(data);
      })
      .catch(() => {});
  }, [refreshIncomingCount, syncConversations]);

  useEffect(() => {
    void refreshIncomingCount();
  }, [refreshIncomingCount]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void refreshIncomingCount();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshIncomingCount]);

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
      if (conv?.type !== 'group' && conv?.type !== 'channel') return msgs;
      const enriched = enrichMessageSenders(msgs, groupMembersRef.current, userRef.current);
      return applyGroupReadStatuses(enriched, readState, userRef.current.id);
    },
    [],
  );

  const syncChannelMembers = useCallback(async (convId: number) => {
    try {
      const data = await api<{
        members: Array<{
          id: string;
          name: string;
          last_name: string;
          avatar: string | null;
          last_read_at?: string | null;
        }>;
      }>(`/api/chat/channels/${convId}`);
      groupMembersRef.current = membersMapFromGroupApi(
        (data.members ?? []).map((m) => ({
          id: m.id,
          name: m.name,
          last_name: m.last_name,
          avatar: m.avatar,
          last_read_at: m.last_read_at ?? null,
        })),
      );
      setMembersRead(
        (data.members ?? []).map((m) => ({
          user_id: m.id,
          last_read_at: m.last_read_at ?? null,
        })),
      );
      return data;
    } catch {
      groupMembersRef.current = new Map();
      return null;
    }
  }, []);

  const syncGroupMembers = useCallback(async (convId: number) => {
    const conv = conversationsRef.current.find((c) => c.id === convId);
    if (conv?.type === 'channel') {
      return syncChannelMembers(convId);
    }
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
  }, [syncChannelMembers]);

  const getE2EContext = useCallback(
    (convId: number, partnerOverride?: string | null): ConversationKeyContext | null => {
      const conv = conversationsRef.current.find((c) => c.id === convId);
      const convType = conv?.type ?? 'private';
      if (convType === 'channel' || convType === 'saved') return null;
      const partnerId = partnerOverride ?? conv?.other_user?.id ?? null;
      const memberIds =
        convType === 'group'
          ? [...groupMembersRef.current.keys()]
          : [user.id, partnerId].filter((id): id is string => !!id);
      if (convType === 'private' && !partnerId && memberIds.length < 2) {
        return null;
      }
      return buildE2EContextFromConversation(convId, convType, memberIds, user.id, partnerId);
    },
    [user.id],
  );

  const resolveE2EContextForConv = useCallback(
    async (convId: number): Promise<ConversationKeyContext | null> => {
      const conv = conversationsRef.current.find((c) => c.id === convId);
      const convType = conv?.type ?? 'private';

      const tryGroup = async (): Promise<ConversationKeyContext | null> => {
        try {
          const data = await api<{
            members: Array<{ id: string; name: string; last_name: string; avatar: string | null }>;
          }>(`/api/chat/groups/${convId}`);
          const memberIds = (data.members ?? []).map((m) => m.id);
          if (!memberIds.length) return null;
          groupMembersRef.current = membersMapFromGroupApi(data.members ?? []);
          return buildE2EContextFromConversation(convId, 'group', memberIds, user.id, null);
        } catch {
          return null;
        }
      };

      if (convType === 'group') {
        return tryGroup();
      }

      const direct = getE2EContext(convId);
      if (direct) return direct;

      const asGroup = await tryGroup();
      if (asGroup) return asGroup;

      try {
        const data = await api<{ messages: FormattedMessage[] }>(
          `/api/chat/${convId}/messages?limit=5`,
        );
        const partnerId =
          data.messages?.find((m) => m.user_id !== user.id)?.user_id ?? null;
        if (!partnerId) return null;
        return buildE2EContextFromConversation(
          convId,
          'private',
          [user.id, partnerId],
          user.id,
          partnerId,
        );
      } catch {
        return null;
      }
    },
    [getE2EContext, user.id],
  );

  const loadConversations = useCallback(async () => {
    const data = await api<ConversationListItem[]>('/api/chat');
    setConversations(data);
    syncConversations(data);

    await ensureIdentityKeys(user.id).catch(() => {});
    const enriched = await enrichConversationListPreviews(data, user.id, async (conv) => {
      if (conv.type === 'channel' || conv.type === 'saved') return null;
      if (conv.type === 'private' && conv.other_user?.id) {
        return buildE2EContextFromConversation(
          conv.id,
          'private',
          [user.id, conv.other_user.id],
          user.id,
          conv.other_user.id,
        );
      }
      return resolveE2EContextForConv(conv.id);
    });
    setConversations(enriched);
    syncConversations(enriched);
    return enriched;
  }, [syncConversations, user.id, resolveE2EContextForConv]);

  const decryptConvMessages = useCallback(
    async (convId: number, list: FormattedMessage[]) => {
      if (!list.length) return list;
      const partnerHint =
        list.find((m) => m.user_id !== user.id)?.user_id ??
        list.find((m) => m.sender?.id && m.sender.id !== user.id)?.sender?.id ??
        null;
      const ctx = getE2EContext(convId, partnerHint);
      if (!ctx) return list;
      await ensureIdentityKeys(user.id);
      return decryptMessagesForConversation(user.id, ctx, list);
    },
    [getE2EContext, user.id],
  );

  const loadMessages = useCallback(
    async (convId: number, opts?: { silent?: boolean; fromCache?: boolean }) => {
      if (!opts?.silent && !opts?.fromCache) setMessagesLoading(true);
      if (!opts?.silent) setConversationReadLocal(convId);
      const conv = conversationsRef.current.find((c) => c.id === convId);
      const isGroupOrChannel = conv?.type === 'group' || conv?.type === 'channel';
      if (!isGroupOrChannel) {
        groupMembersRef.current = new Map();
      }
      try {
        await ensureIdentityKeys(userRef.current.id).catch(() => {});
        const [, data] = await Promise.all([
          isGroupOrChannel ? syncGroupMembers(convId) : Promise.resolve(null),
          api<{
            messages: FormattedMessage[];
            members_read: MemberRead[];
            has_more?: boolean;
          }>(`/api/chat/${convId}/messages`),
        ]);
        if (activeIdRef.current !== convId) return;
        const readState =
          (conv?.type === 'group' || conv?.type === 'channel') && groupMembersRef.current.size
            ? [...groupMembersRef.current.keys()].map((userId) => {
                const fromApi = (data.members_read ?? []).find((m) => m.user_id === userId);
                return { user_id: userId, last_read_at: fromApi?.last_read_at ?? null };
              })
            : (data.members_read ?? []);
        setMembersRead(readState);
        const enriched = enrichMessageSenders(data.messages ?? [], groupMembersRef.current, userRef.current);
        let nextMessages = applyGroupReadStatuses(enriched, readState, userRef.current.id);
        nextMessages = await decryptConvMessages(convId, nextMessages);
        if (activeIdRef.current !== convId) return;
        setHasMoreOlder(data.has_more ?? (nextMessages.length >= 50));
        setMessages((prev) => {
          if (activeIdRef.current !== convId) return prev;
          if (!opts?.silent || prev.length === 0) return nextMessages;
          const prevLast = prev[prev.length - 1]?.id ?? 0;
          const nextLast = nextMessages[nextMessages.length - 1]?.id ?? 0;
          if (nextLast < prevLast) return prev;
          if (nextLast === prevLast && prev.length >= nextMessages.length) return prev;
          return nextMessages;
        });
        if (!opts?.silent) {
          api(`/api/chat/${convId}/messages/read`, { method: 'POST' }).catch(() => {});
        }
      } finally {
        if (!opts?.silent && !opts?.fromCache) setMessagesLoading(false);
      }
    },
    [decryptConvMessages, setConversationReadLocal, syncGroupMembers],
  );
  loadMessagesRef.current = loadMessages;

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
      let older = applyGroupReadStatuses(enriched, readState, userRef.current.id);
      older = await decryptConvMessages(convId, older);
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
  }, [decryptConvMessages, hasMoreOlder, loadingOlder, membersRead]);

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
      navigate({ activeId: id, tab: 'chats' }, 'replace');
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
    if (!activeId || e2eStatus !== 'ready') {
      if (!activeId) {
        setMessages([]);
        setMembersRead([]);
        setHasMoreOlder(false);
        setMessagesLoading(false);
      }
      return;
    }
    setMessages([]);
    setMembersRead([]);
    setHasMoreOlder(false);
    const cached = readCachedMessages(user.id, activeId);
    if (cached.length) {
      setMessages(cached);
      setHasMoreOlder(true);
      setMessagesLoading(false);
      // If we render from cache first, still acknowledge read state on server.
      setConversationReadLocal(activeId);
      api(`/api/chat/${activeId}/messages/read`, { method: 'POST' }).catch(() => {});
      void loadMessagesRef.current(activeId, { silent: true, fromCache: true });
    } else {
      setMessagesLoading(true);
      void loadMessagesRef.current(activeId);
    }
  }, [activeId, user.id, e2eStatus]);

  useEffect(() => {
    if (!activeId || !messages.length) return;
    writeCachedMessages(user.id, activeId, messages);
  }, [messages, activeId, user.id]);

  useEffect(() => {
    syncConversations(conversations);
  }, [conversations, syncConversations]);

  const realtimeConvIdsKey = useMemo(() => {
    const ids = [...conversations]
      .filter((c) => c.id !== activeId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, REALTIME_LIST_CONV_LIMIT)
      .map((c) => c.id)
      .sort((a, b) => a - b);
    if (ids.length === 0) return '';
    return ids.join(',');
  }, [conversations, activeId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;

      if (visibilityRefreshTimerRef.current != null) {
        window.clearTimeout(visibilityRefreshTimerRef.current);
      }

      visibilityRefreshTimerRef.current = window.setTimeout(() => {
        visibilityRefreshTimerRef.current = null;
        if (Date.now() < filePickerGraceUntilRef.current) return;
        loadConversations().catch(() => {});
      }, 350);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (visibilityRefreshTimerRef.current != null) {
        window.clearTimeout(visibilityRefreshTimerRef.current);
      }
    };
  }, [loadConversations]);

  useEffect(() => {
    const pollConversations = () => {
      if (document.visibilityState !== 'visible') return;
      loadConversations().catch(() => {});
    };
    const listTimer = window.setInterval(pollConversations, 300_000);
    return () => window.clearInterval(listTimer);
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId) return;
    const conv = conversationsRef.current.find((c) => c.id === activeId);
    if (!conv || conv.type === 'channel') return;

    const syncReadState = () => {
      if (document.visibilityState !== 'visible') return;
      api<{
        messages: FormattedMessage[];
        members_read: MemberRead[];
      }>(`/api/chat/${activeId}/messages?limit=40`)
        .then((data) => {
          if (activeIdRef.current !== activeId) return;
          const freshMessages = data.messages ?? [];
          const hasNewMessages = freshMessages.some(
            (m) => !messagesRef.current.some((local) => local.id === m.id),
          );
          const hasUnreadFromOthers = freshMessages.some(
            (m) => m.user_id !== user.id && !m.read_at && (m.message_type || 'user') === 'user' && !m.is_deleted,
          );
          // Fallback when realtime transport drops: reload latest messages batch.
          if (hasNewMessages) {
            void loadMessagesRef.current(activeId, { silent: true, fromCache: true });
          }
          if (hasUnreadFromOthers) {
            void api(`/api/chat/${activeId}/messages/read`, { method: 'POST' }).catch(() => {});
            setConversationReadLocal(activeId);
          }
          setMembersRead(data.members_read ?? []);
          const freshById = new Map(freshMessages.map((m) => [m.id, m]));
          setMessages((prev) => {
            const next = prev.map((m) => {
              const fresh = freshById.get(m.id);
              if (!fresh) return m;
              return {
                ...m,
                read_at: fresh.read_at ?? m.read_at,
              };
            });
            return applyGroupRead(next, data.members_read ?? [], activeId);
          });
        })
        .catch(() => {});
    };

    const readTimer = window.setInterval(syncReadState, 5_000);
    return () => window.clearInterval(readTimer);
  }, [activeId, applyGroupRead]);

  useEffect(() => {
    if (!activeId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadMessagesRef.current(activeId, { silent: true, fromCache: true });
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [activeId]);

  const handleListRealtimeMessage = useRealtimeMessageReducer({
    userId: user.id,
    isViewingConversation,
    loadConversations,
    notifyIncomingMessage,
    setConversationReadLocal,
    decryptConvMessages,
    setConversations,
    setMessages,
    applyGroupRead,
    membersReadRef,
    activeIdRef,
    groupMembersRef,
    userRef,
    conversationsRef,
  });

  useChatRealtime(realtimeConvIdsKey, {
    onMessage: handleListRealtimeMessage,
  });

  useUserRealtime(user.id, {
    onCallSignaling,
    onUserMessage: handleListRealtimeMessage,
    onContactsChanged,
    onContactRequest,
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
            forwarded_from: enriched.forwarded_from ?? m.forwarded_from,
            forwarded_from_id: enriched.forwarded_from_id ?? m.forwarded_from_id,
            e2e_plaintext: enriched.e2e_plaintext ?? m.e2e_plaintext,
            e2e_file_name: enriched.e2e_file_name ?? m.e2e_file_name,
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
      }, 3500);
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
    onMessagesRead: (data) => {
      const convId = activeIdRef.current;
      if (!convId || data.conversation_id !== convId) return;
      const idSet = new Set(data.message_ids);
      setMessages((prev) =>
        prev.map((m) => {
          if (!idSet.has(m.id) || m.user_id !== user.id) return m;
          return { ...m, read_at: data.read_at };
        }),
      );
    },
  });

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const activePartnerId = activeConv?.other_user?.id ?? null;
  const activeE2eContext = useMemo(
    () => (activeId ? getE2EContext(activeId, activePartnerId) : null),
    [activeId, activePartnerId, getE2EContext],
  );

  const sendMessage = async (text: string, options?: SendMessageOptions): Promise<number[]> => {
    if (!activeId) return [];
    const files = options?.files ?? [];
    const replyToId = options?.replyToId;
    const convId = activeId;
    await ensureIdentityKeys(user.id);
    const partnerId =
      activeConv?.other_user?.id ??
      conversationsRef.current.find((c) => c.id === convId)?.other_user?.id ??
      null;
    const e2eCtx = getE2EContext(convId, partnerId);
    if (
      text &&
      activeConv?.type !== 'group' &&
      activeConv?.type !== 'channel' &&
      !e2eCtx
    ) {
      throw new Error('Не удалось определить собеседника для шифрования. Обновите страницу.');
    }
    const e2eFiles = e2eCtx ? buildE2EFileTransform(user.id, e2eCtx) : undefined;

    const postOne = async (form: FormData, plainText?: string, plainFileName?: string) => {
      const msg = await api<FormattedMessage>(`/api/chat/${convId}/messages`, {
        method: 'POST',
        body: form,
        headers: {},
      });
      const enriched = enrichMessageSender(msg, groupMembersRef.current, user);
      if (plainText) enriched.e2e_plaintext = plainText;
      if (plainFileName) enriched.e2e_file_name = plainFileName;
      return enriched;
    };

    if (!files.length) {
      const form = new FormData();
      const plainText = text;
      if (text) {
        const payload = e2eCtx ? await encryptOutgoingText(user.id, e2eCtx, text) : text;
        form.append('content', payload);
      }
      if (replyToId) form.append('reply_to_id', String(replyToId));
      const enriched = await postOne(form, plainText || undefined);
      setMessages((prev) => {
        const withReply = enrichMessageReply(enriched, prev);
        if (prev.some((m) => m.id === withReply.id)) return prev;
        return applyGroupRead([...prev, withReply], membersRead, convId);
      });
      options?.onCreated?.([enriched.id]);
      setConversations((prev) =>
        patchConversationFromMessage(prev, convId, enriched, {
          incrementUnread: false,
          currentUserId: user.id,
        }),
      );
      void loadMessagesRef.current(convId, { silent: true, fromCache: true });
      void loadConversations().catch(() => {});
      return [enriched.id];
    }

    const albumGroupId = files.length > 1 && files.every((f) => f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name))
      ? crypto.randomUUID()
      : null;

    const created: FormattedMessage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const prepared = await prepareMessageFileForSend(user.id, file, e2eFiles);
      const form = new FormData();
      const plainText = i === 0 ? text : '';
      if (i === 0 && text) {
        const payload = e2eCtx ? await encryptOutgoingText(user.id, e2eCtx, text) : text;
        form.append('content', payload);
      }
      appendPreparedFileToForm(form, prepared);
      if (albumGroupId) form.append('album_group_id', albumGroupId);
      if (replyToId && i === 0) form.append('reply_to_id', String(replyToId));
      const enriched = await postOne(form, plainText || undefined, file.name);
      created.push(enriched);
    }

    setMessages((prev) => {
      let next = prev;
      for (const raw of created) {
        const enriched = enrichMessageReply(raw, next);
        if (next.some((m) => m.id === enriched.id)) continue;
        next = applyGroupRead([...next, enriched], membersRead, convId);
      }
      return next;
    });
    options?.onCreated?.(created.map((m) => m.id));
    if (created.length) {
      const last = created[created.length - 1]!;
      setConversations((prev) =>
        patchConversationFromMessage(prev, convId, last, {
          incrementUnread: false,
          currentUserId: user.id,
        }),
      );
    }
    void loadMessagesRef.current(convId, { silent: true, fromCache: true });
    void loadConversations().catch(() => {});
    return created.map((m) => m.id);
  };

  const sendVoiceMessage = async (blob: Blob, duration: number, mimeType: string) => {
    if (!activeId) return;
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
    const e2eCtx = getE2EContext(activeId);
    const e2eFiles = e2eCtx ? buildE2EFileTransform(user.id, e2eCtx) : undefined;
    let body: Blob = blob;
    const voiceName = `voice.${ext}`;
    if (e2eFiles) {
      body = await e2eFiles.encryptBlob(blob);
    }
    const form = new FormData();
    form.append('file', body, e2eFiles ? 'encrypted.e2e' : voiceName);
    form.append('file_type', 'voice');
    if (e2eFiles) {
      form.append('file_original_name', await e2eFiles.encryptName(voiceName));
    }
    form.append('voice_duration', String(duration));
    const msg = await api<FormattedMessage>(`/api/chat/${activeId}/messages`, {
      method: 'POST',
      body: form,
      headers: {},
    });
    const enriched = enrichMessageSender(msg, groupMembersRef.current, user);
    enriched.e2e_file_name = voiceName;
    setMessages((prev) => {
      if (prev.some((m) => m.id === enriched.id)) return prev;
      return applyGroupRead([...prev, enriched], membersRead, activeId);
    });
    setConversations((prev) =>
      patchConversationFromMessage(prev, activeId, enriched, {
        incrementUnread: false,
        currentUserId: user.id,
      }),
    );
    void loadMessagesRef.current(activeId, { silent: true, fromCache: true });
    void loadConversations().catch(() => {});
  };

  const editMessage = async (messageId: number, content: string) => {
    const convId = activeId;
    const e2eCtx = convId ? getE2EContext(convId) : null;
    const payload = e2eCtx ? await encryptOutgoingText(user.id, e2eCtx, content) : content;
    const updated = enrichMessageSender(
      await api<FormattedMessage>(`/api/chat/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: payload }),
      }),
      groupMembersRef.current,
      user,
    );
    updated.e2e_plaintext = content;
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

  const deleteMessages = async (messageIds: number[]) => {
    const unique = [...new Set(messageIds.filter((id) => Number.isFinite(id) && id > 0))];
    if (!unique.length) return;
    const convId = activeId;
    const results = await Promise.all(
      unique.map((id) =>
        api<FormattedMessage>(`/api/chat/messages/${id}`, { method: 'DELETE' }),
      ),
    );
    const byId = new Map(
      results.map((row) => [
        row.id,
        enrichMessageSender(row, groupMembersRef.current, user),
      ]),
    );
    setMessages((prev) => {
      const next = prev.map((m) => {
        const updated = byId.get(m.id);
        return updated ? { ...m, ...updated } : m;
      });
      return convId ? applyGroupRead(next, membersRead, convId) : next;
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

  const requestForwardMessages = useCallback(
    (items: FormattedMessage | FormattedMessage[], excludeConversationId?: number | null) => {
      const list = Array.isArray(items) ? items : [items];
      const forwardable = list.filter(
        (m) => m.message_type === 'user' && !m.is_deleted,
      );
      if (!forwardable.length) return;

      void (async () => {
        const byConv = new Map<number, FormattedMessage[]>();
        for (const m of forwardable) {
          const cid = m.conversation_id ?? excludeConversationId ?? activeId;
          if (!cid) continue;
          const batch = byConv.get(cid) ?? [];
          batch.push(m);
          byConv.set(cid, batch);
        }

        const decrypted: FormattedMessage[] = [];
        for (const [cid, batch] of byConv) {
          await resolveE2EContextForConv(cid);
          decrypted.push(...(await decryptConvMessages(cid, batch)));
        }

        const order = new Map(forwardable.map((m, i) => [m.id, i]));
        decrypted.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

        setForwardPayload({
          messages: decrypted.length ? decrypted : forwardable,
          excludeConversationId: excludeConversationId ?? activeId,
        });
      })();
    },
    [activeId, decryptConvMessages, resolveE2EContextForConv],
  );

  const forwardMessagesToChats = async (
    sources: FormattedMessage[],
    conversationIds: number[],
    caption: string,
  ) => {
    await ensureIdentityKeys(user.id).catch(() => {});

    const sourceConvId = sources[0]?.conversation_id ?? activeIdRef.current;
    const sourcePartnerHint =
      sources.find((m) => m.user_id !== user.id)?.user_id ??
      sources.find((m) => m.sender?.id && m.sender.id !== user.id)?.sender?.id ??
      null;

    const sourceCtx = sourceConvId
      ? (await resolveE2EContextForConv(sourceConvId)) ??
        (getE2EContext(sourceConvId, sourcePartnerHint) ?? null)
      : null;

    const decryptedSources = sourceConvId
      ? await decryptConvMessages(sourceConvId, sources)
      : sources;

    const result = await api<{ messages: FormattedMessage[] }>(
      '/api/chat/messages/forward',
      {
        method: 'POST',
        body: JSON.stringify({
          message_ids: sources.map((m) => m.id),
          conversation_ids: conversationIds,
          caption,
        }),
      },
    );

    let forwarded = result.messages ?? [];

    if (forwarded.length) {
      const updates = await buildForwardReencryptUpdates(
        user.id,
        decryptedSources,
        sourceCtx,
        forwarded,
        caption,
        resolveE2EContextForConv,
      );
      if (updates.length) {
        const finalized = await api<{ messages: FormattedMessage[] }>(
          '/api/chat/messages/forward/finalize',
          {
            method: 'POST',
            body: JSON.stringify({ updates }),
          },
        );
        const byId = new Map((finalized.messages ?? []).map((m) => [m.id, m]));
        forwarded = forwarded.map((m) => byId.get(m.id) ?? m);
      }
    }

    const convId = activeIdRef.current;

    const lastByConv = new Map<number, FormattedMessage>();
    for (const msg of forwarded) {
      if (msg.conversation_id) lastByConv.set(msg.conversation_id, msg);
    }

    setConversations((prev) => {
      let next = prev;
      for (const [targetId, msg] of lastByConv) {
        next = patchConversationFromMessage(next, targetId, msg, {
          incrementUnread: false,
          currentUserId: user.id,
        });
      }
      return next;
    });

    if (convId) {
      const forActive = forwarded.filter((m) => m.conversation_id === convId);
      if (forActive.length) {
        const enriched = forActive.map((msg) =>
          enrichMessageReply(enrichMessageSender(msg, groupMembersRef.current, user), []),
        );
        const decrypted = await decryptConvMessages(convId, enriched);
        setMessages((prev) => {
          let next = prev;
          for (const msg of decrypted) {
            const withReply = enrichMessageReply(msg, next);
            const idx = next.findIndex((m) => m.id === withReply.id);
            if (idx >= 0) {
              next = [...next];
              next[idx] = {
                ...next[idx],
                ...withReply,
                forwarded_from: withReply.forwarded_from ?? next[idx]?.forwarded_from,
                forwarded_from_id: withReply.forwarded_from_id ?? next[idx]?.forwarded_from_id,
                e2e_plaintext: withReply.e2e_plaintext ?? next[idx]?.e2e_plaintext,
                e2e_file_name: withReply.e2e_file_name ?? next[idx]?.e2e_file_name,
              };
            } else {
              next = applyGroupRead([...next, withReply], membersRead, convId);
            }
          }
          return next;
        });
      }
    }

    const msgCount = sources.length;
    const chatCount = conversationIds.length;
    const msgWord =
      msgCount === 1 ? 'сообщение' : msgCount < 5 ? 'сообщения' : 'сообщений';
    const chatWord = chatCount === 1 ? 'чат' : chatCount < 5 ? 'чата' : 'чатов';
    showToast(`Переслано ${msgCount} ${msgWord} в ${chatCount} ${chatWord}`);
  };

  const pinnedCount = useMemo(
    () => conversations.filter((c) => c.is_pinned && !c.is_archived).length,
    [conversations],
  );

  const pinConversation = async (conv: ConversationListItem) => {
    try {
      const wantPinned = !conv.is_pinned;
      const data = await api<{ is_pinned: boolean; pinned_at: string | null }>(
        `/api/chat/${conv.id}/pin`,
        {
          method: 'POST',
          body: JSON.stringify({ pinned: wantPinned }),
        },
      );
      setConversations((prev) =>
        sortConversations(
          prev.map((c) =>
            c.id === conv.id
              ? { ...c, is_pinned: data.is_pinned, pinned_at: data.pinned_at }
              : c,
          ),
        ),
      );
      showToast(data.is_pinned ? 'Чат закреплён' : 'Чат откреплён');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось изменить закрепление');
    }
  };

  const archiveConversation = async (conv: ConversationListItem) => {
    try {
      const data = await api<{ is_archived: boolean }>(`/api/chat/${conv.id}/archive`, {
        method: 'POST',
      });
      await loadConversations();
      if (data.is_archived && activeId === conv.id) closeChat();
      showToast(data.is_archived ? 'Чат в архиве' : 'Чат возвращён из архива');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось изменить архив');
    }
  };

  const deleteConversation = async (conv: ConversationListItem) => {
    const isGroup = conv.type === 'group';
    const isChannel = conv.type === 'channel';
    const isAdmin = conv.my_role === 'admin';

    if ((isGroup || isChannel) && isAdmin) {
      const label = isGroup ? 'группу' : 'канал';
      if (
        !window.confirm(
          `Удалить ${label} безвозвратно? Все участники потеряют доступ, сообщения будут удалены.`,
        )
      ) {
        return;
      }
      try {
        const path = isGroup
          ? `/api/chat/groups/${conv.id}`
          : `/api/chat/channels/${conv.id}`;
        await api(path, { method: 'DELETE' });
        setConversations((prev) => prev.filter((c) => c.id !== conv.id));
        if (activeId === conv.id) {
          setMessages([]);
          closeChat();
        }
        showToast(isGroup ? 'Группа удалена' : 'Канал удалён');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Не удалось удалить');
      }
      return;
    }

    const isPrivate = conv.type === 'private';
    const confirmText = isPrivate
      ? 'Удалить приватный чат у обоих пользователей безвозвратно? Это действие нельзя отменить.'
      : 'Удалить чат из списка? История сохранится и чат появится снова при новом сообщении.';
    if (!window.confirm(confirmText)) return;
    try {
      await api(`/api/chat/${conv.id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== conv.id));
      if (activeId === conv.id) closeChat();
      showToast('Чат удалён');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось удалить чат');
    }
  };

  const openChatActionsMenu = () => {
    if (!activeConv) return;
    setConvActionsMenu({
      conv: activeConv,
      x: Math.max(12, window.innerWidth - 240),
      y: 72,
    });
  };

  const sendTyping = useCallback(() => {
    if (!activeId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1200) return;
    lastTypingSentRef.current = now;
    api(`/api/chat/${activeId}/typing`, { method: 'POST' }).catch(() => {});
  }, [activeId]);

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
                <span className="nav-item__icon" aria-hidden="true">
                  <VellaraIcon name={item.icon} size={18} />
                </span>
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
          onClick={() => navigate({ tab: 'dashboard' }, 'push')}
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
                    navigate({ profileUserId: null, activeId: res.id }, 'push');
                  } catch (e) {
                    showToast(e instanceof Error ? e.message : 'Не удалось открыть чат');
                  }
                }}
                onOpenSettings={() => navigate({ tab: 'settings' }, 'push')}
              />
            </div>
          ) : tab === 'chats' ? (
            <div className={`chat-layout ${chatOpen ? 'chat-open' : ''}`}>
              <ConversationSidebar
                conversations={conversations}
                activeId={activeId}
                loading={loading}
                isMobile={isMobile}
                onSelect={(id) => navigate({ activeId: id }, 'push')}
                onRefresh={loadConversations}
                onPinConversation={pinConversation}
                onArchiveConversation={archiveConversation}
                onDeleteConversation={deleteConversation}
                onCreateGroup={async () => {
                  const list = await api<
                    { id: string; name: string; last_name: string; email?: string; avatar?: string | null }[]
                  >('/api/contacts/my');
                  setContactsForGroup(list);
                  navigate({ showCreateGroup: true }, 'push');
                }}
                onCreateChannel={async () => {
                  const list = await api<
                    { id: string; name: string; last_name: string; email?: string; avatar?: string | null }[]
                  >('/api/contacts/my');
                  setContactsForGroup(list);
                  navigate({ showCreateChannel: true }, 'push');
                }}
              />
              {activeId ? (
                <ChatPanel
                  conversation={activeConv}
                  e2eContext={activeE2eContext}
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
                  onDeleteMessages={deleteMessages}
                  onToggleSave={toggleSaveMessage}
                  onForwardMessage={(msg) => requestForwardMessages(msg, activeId)}
                  onTyping={sendTyping}
                  onOpenGroupInfo={
                    activeConv?.type === 'group' || activeConv?.type === 'channel'
                      ? () => navigate({ showGroupPanel: true }, 'push')
                      : undefined
                  }
                  onOpenPartnerProfile={
                    activeConv?.type !== 'group' &&
                    activeConv?.type !== 'channel' &&
                    activeConv?.other_user?.id
                      ? () =>
                          navigate({ profileUserId: activeConv.other_user!.id }, 'push')
                      : undefined
                  }
                  onOpenGroupSettings={
                    (activeConv?.type === 'group' || activeConv?.type === 'channel') &&
                    activeConv.my_role === 'admin'
                      ? () => navigate({ showGroupSettings: true }, 'push')
                      : undefined
                  }
                  onOpenChatActions={openChatActionsMenu}
                  onBack={isMobile ? closeChat : undefined}
                  onFilePickerOpen={() => {
                    filePickerGraceUntilRef.current = Date.now() + 120_000;
                  }}
                  onFilePickerDone={() => {
                    filePickerGraceUntilRef.current = Date.now() + 800;
                  }}
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
                  navigate({ activeId: res.id, tab: 'chats' }, 'push');
                } catch (e) {
                  showToast(e instanceof Error ? e.message : 'Не удалось открыть чат');
                }
              }}
            />
          ) : tab === 'calls' ? (
            <CallsPanel />
          ) : tab === 'favorites' ? (
            <FavoritesPanel
              isMobile={isMobile}
              onForwardMessage={(msg) => requestForwardMessages(msg, null)}
            />
          ) : tab === 'settings' ? (
            <SettingsPanel
              showMobileBack={isMobile}
              onBack={() => goBack()}
            />
          ) : tab === 'dashboard' ? (
            <DashboardPanel onOpenSettings={() => navigate({ tab: 'settings' }, 'push')} />
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
            navigate({ activeId: id, tab: 'chats', showCreateGroup: false }, 'replace');
          }}
        />
      )}
      {showCreateChannel && (
        <CreateChannelModal
          contacts={contactsForGroup}
          onClose={() => goBack()}
          onCreated={async (id) => {
            await loadConversations();
            navigate({ activeId: id, tab: 'chats', showCreateChannel: false }, 'replace');
          }}
        />
      )}
      {convActionsMenu && (
        <ConversationActionsMenu
          conversation={convActionsMenu.conv}
          x={convActionsMenu.x}
          y={convActionsMenu.y}
          isMobile={isMobile}
          pinnedCount={pinnedCount}
          onPin={() => void pinConversation(convActionsMenu.conv).then(() => setConvActionsMenu(null))}
          onArchive={() =>
            void archiveConversation(convActionsMenu.conv).then(() => setConvActionsMenu(null))
          }
          onDelete={() =>
            void deleteConversation(convActionsMenu.conv).then(() => setConvActionsMenu(null))
          }
          onClose={() => setConvActionsMenu(null)}
        />
      )}
      {forwardPayload && (
        <ForwardDestinationModal
          messages={forwardPayload.messages}
          conversations={conversations}
          excludeConversationId={forwardPayload.excludeConversationId}
          onClose={() => setForwardPayload(null)}
          onForward={(ids, caption) =>
            forwardMessagesToChats(forwardPayload.messages, ids, caption)
          }
        />
      )}
      {showGroupPanel && activeId && activeConv?.type === 'group' && (
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
            navigate({ showGroupPanel: false, activeId: null }, 'replace');
            loadConversations();
          }}
          onDeleted={() => {
            navigate({ showGroupPanel: false, activeId: null }, 'replace');
            setMessages([]);
            loadConversations();
          }}
        />
      )}
      {showGroupPanel && activeId && activeConv?.type === 'channel' && (
        <ChannelInfoPanel
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
            navigate({ showGroupPanel: false, activeId: null }, 'replace');
            loadConversations();
          }}
          onDeleted={() => {
            navigate({ showGroupPanel: false, activeId: null }, 'replace');
            setMessages([]);
            loadConversations();
          }}
        />
      )}
      {showGroupSettings && activeId && activeConv?.type === 'group' && (
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
      {showGroupSettings && activeId && activeConv?.type === 'channel' && (
        <ChannelSettingsModal
          conversationId={activeId}
          onClose={() => goBack()}
          onSaved={({ allow_comments, is_public }) => {
            setConversations((prev) =>
              prev.map((c) => (c.id === activeId ? { ...c, allow_comments, is_public } : c)),
            );
          }}
        />
      )}

      {phase === 'incoming' && (
        <IncomingCallModal
          caller={incoming?.caller ?? null}
          isVideo={incoming?.type === 'video'}
          onAccept={() =>
            acceptIncoming().catch((e) =>
              showToast(e instanceof Error ? e.message : 'Не удалось принять звонок'),
            )
          }
          onReject={() => rejectIncoming()}
        />
      )}

      {activeCallScreenVisible && (
        <CallScreen
          phase={phase}
          peer={activeCallPeer}
          isVideo={mode === 'video'}
          onAccept={() =>
            acceptIncoming().catch((e) =>
              showToast(e instanceof Error ? e.message : 'Не удалось принять звонок'),
            )
          }
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
            navigate(
              { tab: 'chats', activeId: messageNotification.conversationId },
              'push',
            );
          }}
        >
          <span className="msg-notification__icon">
            <VellaraIcon name="chats" size={20} />
          </span>
          <span className="msg-notification__body">
            <strong>{messageNotification.title}</strong>
            <span>{messageNotification.body}</span>
          </span>
        </button>
      )}
      {(e2eStatus === 'recovery' || e2eStatus === 'no_backup') && (
        <E2ERecoveryModal
          mode={e2eStatus === 'no_backup' ? 'no_backup' : 'recovery'}
          error={e2eError}
          onRestore={restoreE2E}
        />
      )}
    </div>
  );
}
