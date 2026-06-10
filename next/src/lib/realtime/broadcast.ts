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
      const timer = setTimeout(() => resolve(false), 2000);
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

function sendBroadcast(topic: string, event: string, payload: Record<string, unknown>) {
  void (async () => {
    const { channel, ready } = getPooledChannel(topic);
    const ok = await ready;
    if (!ok) return;
    try {
      await channel.send({ type: 'broadcast', event, payload });
    } catch {
      channelPool.delete(topic);
    }
  })();
}

/** Ephemeral events: typing, new message fan-out (client-to-client via broadcast channel). */
export function broadcastToConversation(
  _supabase: unknown,
  conversationId: number,
  event: string,
  payload: Record<string, unknown>,
) {
  sendBroadcast(`conversation:${conversationId}`, event, payload);
}

export function broadcastToUser(
  _supabase: unknown,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  sendBroadcast(`user:${userId}`, event, payload);
}
