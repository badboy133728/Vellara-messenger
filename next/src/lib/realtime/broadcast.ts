import { createAdminClient } from '@/lib/supabase/admin';
import type { RealtimeChannel } from '@supabase/supabase-js';

type PoolEntry = { channel: RealtimeChannel; ready: Promise<boolean> };

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

function sendPooled(topic: string, event: string, payload: Record<string, unknown>) {
  void (async () => {
    const { channel, ready } = getPooledChannel(topic);
    if (!(await ready)) return;
    try {
      await channel.send({ type: 'broadcast', event, payload });
    } catch {
      channelPool.delete(topic);
    }
  })();
}

/** Быстрый fan-out: не блокирует ответ API, канал переиспользуется на warm-инстансе. */
export function broadcastToConversation(
  _supabase: unknown,
  conversationId: number,
  event: string,
  payload: Record<string, unknown>,
) {
  sendPooled(`conversation:${conversationId}`, event, payload);
}

export function broadcastToUser(
  _supabase: unknown,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  sendPooled(`user:${userId}`, event, payload);
}
