import type { ConversationListItem, FormattedMessage } from '@/lib/types';

export function formatIncomingMessagePreview(
  msg: Pick<FormattedMessage, 'content' | 'file_type' | 'file_original_name' | 'message_type'>,
): string {
  if (msg.message_type === 'system') return msg.content || 'Системное сообщение';
  if (msg.file_type === 'voice') return 'Голосовое сообщение';
  if (msg.file_type === 'image') return 'Фото';
  if (msg.file_type === 'document') return msg.file_original_name || 'Файл';
  const text = (msg.content || '').trim();
  if (!text) return 'Сообщение';
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

export function conversationPreviewFromMessage(
  msg: Pick<
    FormattedMessage,
    'content' | 'file_type' | 'file_original_name' | 'message_type' | 'user_id'
  >,
  viewerId: string,
): string {
  const base = formatIncomingMessagePreview(msg);
  if (msg.user_id === viewerId) return `Вы: ${base}`;
  return base;
}

export function conversationTitle(c: ConversationListItem): string {
  if (c.type === 'group') return c.title ?? 'Группа';
  if (c.other_user) return `${c.other_user.name} ${c.other_user.last_name}`.trim();
  return 'Чат';
}

export function patchConversationFromMessage(
  conversations: ConversationListItem[],
  convId: number,
  msg: FormattedMessage,
  options: { incrementUnread: boolean; currentUserId: string },
): ConversationListItem[] {
  const idx = conversations.findIndex((c) => c.id === convId);
  if (idx === -1) return conversations;

  const item = conversations[idx];
  const preview = conversationPreviewFromMessage(msg, options.currentUserId);
  const updated: ConversationListItem = {
    ...item,
    last_message: {
      id: msg.id,
      content: msg.content,
      user_id: msg.user_id,
      created_at: msg.created_at,
      file_path: msg.file_path,
      file_type: msg.file_type,
      file_original_name: msg.file_original_name,
      voice_duration: msg.voice_duration,
      album_group_id: msg.album_group_id,
      is_deleted: msg.is_deleted,
    },
    last_message_preview: preview,
    updated_at: msg.created_at,
    unread_count: options.incrementUnread
      ? (item.unread_count || 0) + 1
      : item.unread_count,
    has_unread: options.incrementUnread ? true : item.has_unread,
  };

  const next = [...conversations];
  next.splice(idx, 1);
  next.unshift(updated);
  return next;
}

export function clearConversationUnread(
  conversations: ConversationListItem[],
  convId: number,
): ConversationListItem[] {
  return conversations.map((c) =>
    c.id === convId ? { ...c, unread_count: 0, has_unread: false } : c,
  );
}
