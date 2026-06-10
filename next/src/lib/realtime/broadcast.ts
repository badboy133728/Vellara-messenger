import { createAdminClient } from '@/lib/supabase/admin';

async function sendBroadcast(
  topic: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const supabase = createAdminClient();
  const channel = supabase.channel(topic, {
    config: { broadcast: { ack: true, self: false } },
  });

  await new Promise<void>((resolve) => {
    const finish = () => {
      void supabase.removeChannel(channel);
      resolve();
    };
    const timer = setTimeout(() => void finish(), 5000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.send({ type: 'broadcast', event, payload }).finally(() => {
          clearTimeout(timer);
          void finish();
        });
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        void finish();
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
): Promise<void> {
  return sendBroadcast(`conversation:${conversationId}`, event, payload);
}

export function broadcastToUser(
  _supabase: unknown,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  return sendBroadcast(`user:${userId}`, event, payload);
}
