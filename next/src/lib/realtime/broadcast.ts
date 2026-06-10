import { createAdminClient } from '@/lib/supabase/admin';

/** Ephemeral events: typing, new message fan-out (client-to-client via broadcast channel). */
export async function broadcastToConversation(
  _supabase: unknown,
  conversationId: number,
  event: string,
  payload: Record<string, unknown>,
) {
  const supabase = createAdminClient();
  const channel = supabase.channel(`conversation:${conversationId}`, {
    config: { broadcast: { ack: true, self: false } },
  });

  await new Promise<void>((resolve) => {
    const done = async () => {
      supabase.removeChannel(channel);
      resolve();
    };
    const timer = setTimeout(() => void done(), 5000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.send({ type: 'broadcast', event, payload }).finally(() => {
          clearTimeout(timer);
          void done();
        });
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        void done();
      }
    });
  });
}

export async function broadcastToUser(
  _supabase: unknown,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  const supabase = createAdminClient();
  const channel = supabase.channel(`user:${userId}`, {
    config: { broadcast: { ack: true, self: false } },
  });

  await new Promise<void>((resolve) => {
    const done = async () => {
      supabase.removeChannel(channel);
      resolve();
    };
    const timer = setTimeout(() => void done(), 5000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.send({ type: 'broadcast', event, payload }).finally(() => {
          clearTimeout(timer);
          void done();
        });
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        void done();
      }
    });
  });
}
