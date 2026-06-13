import { formatMessagePreviewText } from '@/lib/e2e/messageCrypto';
import type { ConversationListItem, FormattedMessage } from '@/lib/types';
import { displayFullName } from '@/utils/formatName';

export function formatIncomingMessagePreview(
  msg: Pick<
    FormattedMessage,
    | 'content'
    | 'file_type'
    | 'file_original_name'
    | 'message_type'
    | 'is_deleted'
    | 'e2e_plaintext'
    | 'e2e_file_name'
  >,
): string {
  return formatMessagePreviewText(msg, 60);
}

export function conversationPreviewFromMessage(
  msg: Pick<
    FormattedMessage,
    | 'content'
    | 'file_type'
    | 'file_original_name'
    | 'message_type'
    | 'user_id'
    | 'is_deleted'
    | 'e2e_plaintext'
    | 'e2e_file_name'
  >,
  viewerId: string,
  convType?: string,
): string {
  const base = formatIncomingMessagePreview(msg);
  if (convType === 'channel') return base;
  if (msg.user_id === viewerId) return `Вы: ${base}`;
  return base;
}

export function conversationTitle(c: ConversationListItem): string {
  if (c.type === 'group') return c.title ?? 'Группа';
  if (c.type === 'channel') return c.title ?? 'Канал';
  if (c.other_user) return displayFullName(c.other_user.name, c.other_user.last_name, 'Чат');
  return 'Чат';
}

export function sortConversations(list: ConversationListItem[]): ConversationListItem[] {
  return [...list].sort((a, b) => {
    if (Boolean(a.is_pinned) !== Boolean(b.is_pinned)) {
      return a.is_pinned ? -1 : 1;
    }
    if (a.is_pinned && b.is_pinned) {
      const pa = a.pinned_at ? new Date(a.pinned_at).getTime() : 0;
      const pb = b.pinned_at ? new Date(b.pinned_at).getTime() : 0;
      if (pa !== pb) return pb - pa;
    }
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
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
  const isChannelComment = item.type === 'channel' && !!msg.reply_to_id;
  const preview = isChannelComment
    ? item.last_message_preview
    : conversationPreviewFromMessage(msg, options.currentUserId, item.type);
  const updated: ConversationListItem = {
    ...item,
    last_message: isChannelComment
      ? item.last_message
      : {
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
  next[idx] = updated;
  return sortConversations(next);
}

export function clearConversationUnread(
  conversations: ConversationListItem[],
  convId: number,
): ConversationListItem[] {
  return conversations.map((c) =>
    c.id === convId ? { ...c, unread_count: 0, has_unread: false } : c,
  );
}
