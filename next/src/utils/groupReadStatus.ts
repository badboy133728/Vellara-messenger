import type { FormattedMessage } from '@/lib/types';

export type MemberRead = { user_id: string; last_read_at: string | null };

export type GroupReadStatus = 'sent' | 'partial' | 'all';

export function computeGroupReadStatus(
  message: Pick<FormattedMessage, 'user_id' | 'created_at'>,
  membersRead: MemberRead[],
): GroupReadStatus {
  const senderId = message.user_id;
  const others = membersRead.filter((m) => m.user_id !== senderId);
  if (!others.length) return 'all';

  const created = new Date(message.created_at).getTime();
  let readCount = 0;
  for (const m of others) {
    if (!m.last_read_at) continue;
    if (new Date(m.last_read_at).getTime() >= created) readCount += 1;
  }
  if (readCount === 0) return 'sent';
  if (readCount < others.length) return 'partial';
  return 'all';
}

export function applyGroupReadStatuses(
  messages: FormattedMessage[],
  membersRead: MemberRead[],
  currentUserId: string,
): FormattedMessage[] {
  return messages.map((msg) => {
    if (msg.user_id !== currentUserId || msg.message_type === 'system') return msg;
    return {
      ...msg,
      group_read_status: computeGroupReadStatus(msg, membersRead),
    };
  });
}
