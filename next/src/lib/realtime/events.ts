import type { FormattedMessage } from '@/lib/types';

export const REALTIME_EVENT_VERSION = 2;

export type RealtimeEventName =
  | 'NewMessage'
  | 'UserMessage'
  | 'MessageUpdated'
  | 'UserTyping'
  | 'MemberRead'
  | 'MessagesRead'
  | 'CallSignaling'
  | 'ContactRequestSent'
  | 'ContactRequestAccepted'
  | 'ContactRequestRejected'
  | 'ContactRemoved';

export type RealtimeMessagePayload = FormattedMessage & { conversation_id: number };

export type UserTypingPayload = {
  conversation_id: number;
  user_id: string;
  last_typing_at?: string;
};

export type MemberReadPayload = {
  conversation_id: number;
  user_id: string;
  last_read_at: string;
};

export type MessagesReadPayload = {
  conversation_id: number;
  reader_id: string;
  read_at: string;
  message_ids: number[];
};

export type CallSignalingPayload = {
  call_id: number;
  signal: string;
  payload: Record<string, unknown>;
};

export type ContactRequestSentPayload = {
  sender_id: string;
  name?: string;
  last_name?: string;
  email?: string;
  avatar?: string | null;
};

export type ContactRequestAcceptedPayload = {
  contact_id: string;
  name?: string;
  conversation_id?: number;
};

export type ContactRequestRejectedPayload = {
  sender_id?: string;
  contact_id?: string;
};

export type ContactRemovedPayload = {
  contact_id: string;
};

export type RealtimeEventPayloadMap = {
  NewMessage: RealtimeMessagePayload;
  UserMessage: RealtimeMessagePayload;
  MessageUpdated: RealtimeMessagePayload;
  UserTyping: UserTypingPayload;
  MemberRead: MemberReadPayload;
  MessagesRead: MessagesReadPayload;
  CallSignaling: CallSignalingPayload;
  ContactRequestSent: ContactRequestSentPayload;
  ContactRequestAccepted: ContactRequestAcceptedPayload;
  ContactRequestRejected: ContactRequestRejectedPayload;
  ContactRemoved: ContactRemovedPayload;
};

export type RealtimeEventPayload<K extends RealtimeEventName> = RealtimeEventPayloadMap[K];

export type RealtimeEnvelopeMeta = {
  version: number;
  event_id: string;
  emitted_at: string;
  dedup_key: string;
};

export type RealtimeEnvelope<K extends RealtimeEventName> = {
  meta: RealtimeEnvelopeMeta;
  data: RealtimeEventPayload<K>;
};

function safePayloadFingerprint(value: unknown): string {
  if (value == null) return 'none';
  if (typeof value !== 'object') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return 'unserializable';
  }
}

export function realtimeDedupKey<K extends RealtimeEventName>(
  event: K,
  payload: RealtimeEventPayload<K>,
): string {
  switch (event) {
    case 'NewMessage': {
      const p = payload as RealtimeMessagePayload;
      return `message:${p.conversation_id}:${p.id}`;
    }
    case 'UserMessage': {
      const p = payload as RealtimeMessagePayload;
      return `user-message:${p.conversation_id}:${p.id}`;
    }
    case 'MessageUpdated': {
      const p = payload as RealtimeMessagePayload;
      return `message-update:${p.conversation_id}:${p.id}:${p.edited_at ?? 'na'}:${p.deleted_at ?? 'na'}:${p.read_at ?? 'na'}`;
    }
    case 'UserTyping': {
      const p = payload as UserTypingPayload;
      return `typing:${p.conversation_id}:${p.user_id}:${p.last_typing_at ?? 'na'}`;
    }
    case 'MemberRead': {
      const p = payload as MemberReadPayload;
      return `member-read:${p.conversation_id}:${p.user_id}:${p.last_read_at}`;
    }
    case 'MessagesRead': {
      const p = payload as MessagesReadPayload;
      return `messages-read:${p.conversation_id}:${p.reader_id}:${p.read_at}:${p.message_ids.join(',')}`;
    }
    case 'CallSignaling': {
      const p = payload as CallSignalingPayload;
      // Include payload fingerprint so successive ICE candidates are not dropped as duplicates.
      return `call:${p.call_id}:${p.signal}:${safePayloadFingerprint(p.payload)}`;
    }
    case 'ContactRequestSent': {
      const p = payload as ContactRequestSentPayload;
      return `contact-request-sent:${p.sender_id}`;
    }
    case 'ContactRequestAccepted': {
      const p = payload as ContactRequestAcceptedPayload;
      return `contact-request-accepted:${p.contact_id}`;
    }
    case 'ContactRequestRejected': {
      const p = payload as ContactRequestRejectedPayload;
      return `contact-request-rejected:${p.sender_id ?? p.contact_id ?? 'unknown'}`;
    }
    case 'ContactRemoved': {
      const p = payload as ContactRemovedPayload;
      return `contact-removed:${p.contact_id}`;
    }
    default:
      return `${event}:unknown`;
  }
}

function isEnvelopeMeta(value: unknown): value is RealtimeEnvelopeMeta {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RealtimeEnvelopeMeta>;
  return (
    typeof candidate.version === 'number' &&
    typeof candidate.event_id === 'string' &&
    typeof candidate.emitted_at === 'string' &&
    typeof candidate.dedup_key === 'string'
  );
}

export function parseRealtimeEnvelope<K extends RealtimeEventName>(
  event: K,
  payload: unknown,
): RealtimeEnvelope<K> {
  if (payload && typeof payload === 'object') {
    const candidate = payload as { meta?: unknown; data?: unknown };
    if (isEnvelopeMeta(candidate.meta) && candidate.data) {
      return {
        meta: candidate.meta,
        data: candidate.data as RealtimeEventPayload<K>,
      };
    }
  }

  const data = payload as RealtimeEventPayload<K>;
  return {
    meta: {
      version: 1,
      event_id: `legacy:${realtimeDedupKey(event, data)}`,
      emitted_at: new Date().toISOString(),
      dedup_key: realtimeDedupKey(event, data),
    },
    data,
  };
}
