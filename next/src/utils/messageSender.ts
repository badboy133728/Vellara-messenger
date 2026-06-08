import type { FormattedMessage } from '@/lib/types';

export type SenderProfile = {
  id: string;
  name: string;
  last_name: string;
  avatar: string | null;
};

export function hasSenderName(sender: SenderProfile | FormattedMessage['sender'] | null | undefined) {
  if (!sender) return false;
  return `${sender.name || ''} ${sender.last_name || ''}`.trim().length > 0;
}

export function enrichMessageSender(
  message: FormattedMessage,
  membersById: Map<string, SenderProfile>,
  self?: Pick<SenderProfile, 'id' | 'name' | 'last_name' | 'avatar'>,
): FormattedMessage {
  if (hasSenderName(message.sender)) return message;

  const cached = membersById.get(message.user_id);
  if (cached && hasSenderName(cached)) {
    return {
      ...message,
      sender: {
        id: cached.id,
        name: cached.name,
        last_name: cached.last_name,
        avatar: cached.avatar ?? message.sender?.avatar ?? null,
      },
    };
  }

  if (self && message.user_id === self.id) {
    return {
      ...message,
      sender: {
        id: self.id,
        name: self.name,
        last_name: self.last_name,
        avatar: self.avatar ?? message.sender?.avatar ?? null,
      },
    };
  }

  return message;
}

export function enrichMessageSenders(
  messages: FormattedMessage[],
  membersById: Map<string, SenderProfile>,
  self?: Pick<SenderProfile, 'id' | 'name' | 'last_name' | 'avatar'>,
) {
  return messages.map((m) => enrichMessageSender(m, membersById, self));
}

export function membersMapFromGroupApi(
  members: Array<{
    id: string;
    name: string;
    last_name: string;
    avatar: string | null;
    last_read_at?: string | null;
  }>,
) {
  const profiles = new Map<string, SenderProfile>();
  for (const m of members) {
    profiles.set(m.id, {
      id: m.id,
      name: m.name ?? '',
      last_name: m.last_name ?? '',
      avatar: m.avatar ?? null,
    });
  }
  return profiles;
}
