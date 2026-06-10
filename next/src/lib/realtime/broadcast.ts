import { createAdminClient } from '@/lib/supabase/admin';
import type { RealtimeChannel } from '@supabase/supabase-js';

type PoolEntry = { channel: RealtimeChannel; ready: Promise<boolean> };

const conversationChannelPool = new Map<string, PoolEntry>();

function getPooledChannel(topic: string): PoolEntry {
  let entry = conversationChannelPool.get(topic);
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
          conversationChannelPool.delete(topic);
          resolve(false);
        }
      });
    });
    entry = { channel, ready };
    conversationChannelPool.set(topic, entry);
  }
  return entry;
}

function sendPooledBroadcast(topic: string, event: string, payload: Record<string, unknown>) {
  void (async () => {
    const { channel, ready } = getPooledChannel(topic);
    const ok = await ready;
    if (!ok) return;
    try {
      await channel.send({ type: 'broadcast', event, payload });
    } catch {
      conversationChannelPool.delete(topic);
    }
  })();
}

/** Guaranteed delivery for low-volume user events (contacts, calls). */
async function sendReliableBroadcast(
  topic: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const supabase = createAdminClient();
  const channel = supabase.channel(topic, {
    config: { broadcast: { ack: false, self: false } },
  });

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      void supabase.removeChannel(channel);
      resolve();
    }, 4000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.send({ type: 'broadcast', event, payload }).finally(() => {
          clearTimeout(timer);
          void supabase.removeChannel(channel);
          resolve();
        });
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        void supabase.removeChannel(channel);
        resolve();
      }
    });
  });
}

/** Ephemeral events: typing, new message fan-out (client-to-client via broadcast channel). */
export function broadcastToConversation(
  _supabase: unknown,
  conversationId: number,
  event: string,
  payload: Record<string, unknown>,
) {
  sendPooledBroadcast(`conversation:${conversationId}`, event, payload);
}

export function broadcastToUser(
  _supabase: unknown,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  return sendReliableBroadcast(`user:${userId}`, event, payload);
}
