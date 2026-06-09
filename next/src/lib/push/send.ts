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
  last_active_at: string | null;
};

/** Не слать push на устройство, где вкладка была активна недавно. */
const PUSH_ACTIVE_GRACE_MS = 45_000;

function isSubscriptionInactive(row: PushSubscriptionRow, nowMs: number): boolean {
  if (!row.last_active_at) return true;
  const activeAt = new Date(row.last_active_at).getTime();
  if (Number.isNaN(activeAt)) return true;
  return nowMs - activeAt > PUSH_ACTIVE_GRACE_MS;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureWebPushConfigured()) return;

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, last_active_at')
    .eq('user_id', userId);

  const nowMs = Date.now();
  const subscriptions = ((rows ?? []) as PushSubscriptionRow[]).filter((row) =>
    isSubscriptionInactive(row, nowMs),
  );
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
