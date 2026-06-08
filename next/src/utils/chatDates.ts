/** Метки дней в ленте чата: Сегодня, Вчера, день недели, дата. */

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
};

export type DateFeedItem = {
  kind: 'date';
  key: string;
  label: string;
  dayKey: string;
};

export type ChatFeedItem = MessageFeedItem | DateFeedItem;

export function withDateDividers(feed: MessageFeedItem[]): ChatFeedItem[] {
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
): ChatFeedItem[] {
  const feed: MessageFeedItem[] = messages.map((m) => ({
    kind: 'message',
    key: `msg-${m.id}`,
    created_at: m.created_at,
    message: m,
  }));
  return withDateDividers(feed);
}

export function formatMessageTime(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
