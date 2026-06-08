import type { SupabaseClient } from '@supabase/supabase-js';

/** Ephemeral events: typing, call signaling (client-to-client via broadcast channel) */
export async function broadcastToConversation(
  supabase: SupabaseClient,
  conversationId: number,
  event: string,
  payload: Record<string, unknown>,
) {
  const channel = supabase.channel(`conversation:${conversationId}`, {
    config: { broadcast: { self: false } },
  });

  await new Promise<void>((resolve) => {
    const done = () => {
      supabase.removeChannel(channel);
      resolve();
    };
    const timer = setTimeout(done, 4000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({ type: 'broadcast', event, payload });
        clearTimeout(timer);
        done();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        done();
      }
    });
  });
}

export async function broadcastToUser(
  supabase: SupabaseClient,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  const channel = supabase.channel(`user:${userId}`, {
    config: { broadcast: { self: false } },
  });

  await new Promise<void>((resolve) => {
    const done = () => {
      supabase.removeChannel(channel);
      resolve();
    };
    const timer = setTimeout(done, 4000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({ type: 'broadcast', event, payload });
        clearTimeout(timer);
        done();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        done();
      }
    });
  });
}
