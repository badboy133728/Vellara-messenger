import type { SupabaseClient } from '@supabase/supabase-js';

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
const TOUCH_INTERVAL_MS = 30_000;

export function isOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

export function formatLastSeenLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Был(а) давно';

  const date = new Date(dateStr);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  const diffHour = Math.floor(diffMin / 60);

  if (diffMin < 2) return 'Был(а) только что';
  if (diffMin < 60) return `Был(а) ${diffMin} мин. назад`;
  if (diffHour < 24) return `Был(а) ${diffHour} ч. назад`;

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Был(а) вчера в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  }

  return `Был(а) ${date.toLocaleDateString('ru-RU')} в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

export async function touchLastSeen(supabase: SupabaseClient, userId: string): Promise<void> {
  const threshold = new Date(Date.now() - TOUCH_INTERVAL_MS).toISOString();
  const now = new Date().toISOString();

  await supabase
    .from('profiles')
    .update({ last_seen_at: now })
    .eq('id', userId)
    .or(`last_seen_at.is.null,last_seen_at.lt.${threshold}`);
}
