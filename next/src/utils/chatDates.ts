/** Метки дней в ленте чата: Сегодня, Вчера, день недели, дата. */

import { effectiveMessageFileType } from '@/lib/chat/attachmentTypes';

export function getMessageTimestamp(item: { created_at?: string; message?: { created_at?: string } }) {
  if (!item) return null;
  if (item.created_at) return item.created_at;
  return item.message?.created_at ?? null;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatDayLabel(dateInput: string | Date) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const diffDays = Math.round(
    (startOfLocalDay(now).getTime() - startOfLocalDay(d).getTime()) / 86400000,
  );

  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  if (diffDays > 1 && diffDays < 7) {
    const weekday = d.toLocaleDateString('ru-RU', { weekday: 'long' });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }

  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('ru-RU', opts);
}

export type MessageFeedItem = {
  kind: 'message';
  key: string;
  created_at: string;
  message: import('@/lib/types').FormattedMessage;
  albumMessages?: import('@/lib/types').FormattedMessage[];
};

export type PendingFeedItem = {
  kind: 'pending';
  key: string;
  created_at: string;
  clientId: string;
  content: string;
  previewUrls: string[];
  videoPreviewUrls: string[];
  fileTypeHint?: 'voice';
  voiceDuration?: number;
};

export type DateFeedItem = {
  kind: 'date';
  key: string;
  label: string;
  dayKey: string;
};

export type ChatFeedItem = MessageFeedItem | DateFeedItem | PendingFeedItem;

export function withDateDividers(feed: (MessageFeedItem | PendingFeedItem)[]): ChatFeedItem[] {
  const result: ChatFeedItem[] = [];
  let lastDayKey: string | null = null;

  for (const item of feed) {
    const at = getMessageTimestamp(item);
    if (!at) {
      result.push(item);
      continue;
    }

    const d = new Date(at);
    if (Number.isNaN(d.getTime())) {
      result.push(item);
      continue;
    }

    const dayKey = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');

    if (dayKey !== lastDayKey) {
      result.push({
        kind: 'date',
        key: `date-${dayKey}`,
        label: formatDayLabel(d),
        dayKey,
      });
      lastDayKey = dayKey;
    }

    result.push(item);
  }

  return result;
}

export function buildMessageFeed(
  messages: import('@/lib/types').FormattedMessage[],
  pending: Omit<PendingFeedItem, 'kind'>[] = [],
): ChatFeedItem[] {
  const feed: MessageFeedItem[] = [];
  const seenAlbums = new Set<string>();

  for (const m of messages) {
    if (m.album_group_id && effectiveMessageFileType(m) === 'image') {
      if (seenAlbums.has(m.album_group_id)) continue;
      seenAlbums.add(m.album_group_id);
      const albumMessages = messages.filter(
        (x) => x.album_group_id === m.album_group_id && effectiveMessageFileType(x) === 'image',
      );
      feed.push({
        kind: 'message',
        key: `album-${m.album_group_id}`,
        created_at: m.created_at,
        message: m,
        albumMessages: albumMessages.length > 1 ? albumMessages : undefined,
      });
      continue;
    }
    feed.push({
      kind: 'message',
      key: `msg-${m.id}`,
      created_at: m.created_at,
      message: m,
    });
  }

  const pendingItems: PendingFeedItem[] = pending.map((p) => ({
    kind: 'pending',
    ...p,
  }));

  return withDateDividers([...feed, ...pendingItems]);
}

export function formatMessageTime(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
