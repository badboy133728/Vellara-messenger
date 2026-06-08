import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureWebPushConfigured } from '@/lib/push/config';

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

type PushSubscriptionRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureWebPushConfigured()) return;

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  const subscriptions = (rows ?? []) as PushSubscriptionRow[];
  if (subscriptions.length === 0) return;

  const url = payload.url?.startsWith('/') ? payload.url : payload.url || '/main';
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url,
    tag: payload.tag,
  });

  await Promise.all(
    subscriptions.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          body,
          {
            TTL: 120,
            urgency: 'high' as const,
          },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('id', row.id);
        }
      }
    }),
  );
}
