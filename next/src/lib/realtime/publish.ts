import {
  realtimeDedupKey,
  REALTIME_EVENT_VERSION,
  type RealtimeEnvelope,
  type RealtimeEventName,
  type RealtimeEventPayload,
} from '@/lib/realtime/events';
import {
  broadcastToConversation,
  broadcastToUser,
  type RealtimePublishResult,
} from '@/lib/realtime/broadcast';

function createEventId(): string {
  const maybeUuid = globalThis.crypto?.randomUUID?.();
  if (maybeUuid) return maybeUuid;
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function createRealtimeEnvelope<K extends RealtimeEventName>(
  event: K,
  payload: RealtimeEventPayload<K>,
): RealtimeEnvelope<K> {
  return {
    meta: {
      version: REALTIME_EVENT_VERSION,
      event_id: createEventId(),
      emitted_at: new Date().toISOString(),
      dedup_key: realtimeDedupKey(event, payload),
    },
    data: payload,
  };
}

async function publishConversationEvent<K extends RealtimeEventName>(
  conversationId: number,
  event: K,
  payload: RealtimeEventPayload<K>,
): Promise<RealtimePublishResult> {
  try {
    return await broadcastToConversation(
      null,
      conversationId,
      event,
      createRealtimeEnvelope(event, payload) as unknown as Record<string, unknown>,
    );
  } catch {
    return {
      ok: false,
      topic: `conversation:${conversationId}`,
      event,
      reason: 'send_failed',
    };
  }
}

async function publishUserEvent<K extends RealtimeEventName>(
  userId: string,
  event: K,
  payload: RealtimeEventPayload<K>,
): Promise<RealtimePublishResult> {
  try {
    return await broadcastToUser(
      null,
      userId,
      event,
      createRealtimeEnvelope(event, payload) as unknown as Record<string, unknown>,
    );
  } catch {
    return {
      ok: false,
      topic: `user:${userId}`,
      event,
      reason: 'send_failed',
    };
  }
}

async function publishUserEventWithRetry<K extends RealtimeEventName>(
  userId: string,
  event: K,
  payload: RealtimeEventPayload<K>,
  attempts = 3,
): Promise<RealtimePublishResult> {
  let last: RealtimePublishResult | null = null;
  for (let i = 0; i < attempts; i += 1) {
    const result = await publishUserEvent(userId, event, payload);
    if (result.ok) return result;
    last = result;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 180 * (i + 1)));
    }
  }
  return (
    last ?? {
      ok: false,
      topic: `user:${userId}`,
      event,
      reason: 'send_failed',
    }
  );
}

export async function publishConversationMessage(payload: RealtimeEventPayload<'NewMessage'>) {
  return publishConversationEvent(payload.conversation_id, 'NewMessage', payload);
}

export async function publishUserMessage(
  userId: string,
  payload: RealtimeEventPayload<'UserMessage'>,
) {
  return publishUserEvent(userId, 'UserMessage', payload);
}

export async function publishConversationMessageUpdated(
  payload: RealtimeEventPayload<'MessageUpdated'>,
) {
  return publishConversationEvent(payload.conversation_id, 'MessageUpdated', payload);
}

export async function publishConversationTyping(payload: RealtimeEventPayload<'UserTyping'>) {
  return publishConversationEvent(payload.conversation_id, 'UserTyping', payload);
}

export async function publishConversationMemberRead(payload: RealtimeEventPayload<'MemberRead'>) {
  return publishConversationEvent(payload.conversation_id, 'MemberRead', payload);
}

export async function publishConversationMessagesRead(
  payload: RealtimeEventPayload<'MessagesRead'>,
) {
  return publishConversationEvent(payload.conversation_id, 'MessagesRead', payload);
}

export async function publishUserCallSignaling(
  userId: string,
  payload: RealtimeEventPayload<'CallSignaling'>,
) {
  return publishUserEventWithRetry(userId, 'CallSignaling', payload, 4);
}

export async function publishUserContactRequestSent(
  userId: string,
  payload: RealtimeEventPayload<'ContactRequestSent'>,
) {
  return publishUserEvent(userId, 'ContactRequestSent', payload);
}

export async function publishUserContactRequestAccepted(
  userId: string,
  payload: RealtimeEventPayload<'ContactRequestAccepted'>,
) {
  return publishUserEvent(userId, 'ContactRequestAccepted', payload);
}

export async function publishUserContactRequestRejected(
  userId: string,
  payload: RealtimeEventPayload<'ContactRequestRejected'>,
) {
  return publishUserEvent(userId, 'ContactRequestRejected', payload);
}

export async function publishUserContactRemoved(
  userId: string,
  payload: RealtimeEventPayload<'ContactRemoved'>,
) {
  return publishUserEvent(userId, 'ContactRemoved', payload);
}
