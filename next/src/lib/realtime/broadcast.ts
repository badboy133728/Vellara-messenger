import { createAdminClient } from '@/lib/supabase/admin';
import type { RealtimeChannel } from '@supabase/supabase-js';

type PoolEntry = { channel: RealtimeChannel; ready: Promise<boolean> };
export type RealtimePublishResult = {
  ok: boolean;
  topic: string;
  event: string;
  reason?: 'subscribe_timeout' | 'send_failed';
};

const channelPool = new Map<string, PoolEntry>();

function getPooledChannel(topic: string): PoolEntry {
  let entry = channelPool.get(topic);
  if (!entry) {
    const supabase = createAdminClient();
    const channel = supabase.channel(topic, {
      config: { broadcast: { ack: false, self: false } },
    });
    const ready = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 3000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer);
          resolve(true);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          channelPool.delete(topic);
          resolve(false);
        }
      });
    });
    entry = { channel, ready };
    channelPool.set(topic, entry);
  }
  return entry;
}

export async function publishRealtimeBroadcast(
  topic: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<RealtimePublishResult> {
  const { channel, ready } = getPooledChannel(topic);
  if (!(await ready)) {
    channelPool.delete(topic);
    return { ok: false, topic, event, reason: 'subscribe_timeout' };
  }
  try {
    await channel.send({ type: 'broadcast', event, payload });
    return { ok: true, topic, event };
  } catch {
    channelPool.delete(topic);
    return { ok: false, topic, event, reason: 'send_failed' };
  }
}

/** Быстрый fan-out: не блокирует ответ API, канал переиспользуется на warm-инстансе. */
export async function broadcastToConversation(
  _supabase: unknown,
  conversationId: number,
  event: string,
  payload: Record<string, unknown>,
) {
  return publishRealtimeBroadcast(`conversation:${conversationId}`, event, payload);
}

export async function broadcastToUser(
  _supabase: unknown,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  return publishRealtimeBroadcast(`user:${userId}`, event, payload);
}
