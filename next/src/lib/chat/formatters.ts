import { isOnline } from '@/lib/presence';
import type { ConversationListItem, FormattedMessage, MemberRow, MessageRow, Profile } from '@/lib/types';

export function messagePreview(msg: MessageRow, viewerId: string, albumCount = 1): string {
  if (msg.deleted_at) return 'Сообщение удалено';
  if (msg.file_type === 'voice') return 'Голосовое сообщение';
  if (msg.file_type === 'image') {
    return albumCount > 1 ? `${albumCount} фото` : 'Фото';
  }
  if (msg.file_type === 'document') return msg.file_original_name || 'Файл';
  const text = (msg.content || '').trim();
  if (!text) return 'Сообщение';
  const prefix = msg.user_id === viewerId ? 'Вы: ' : '';
  return prefix + (text.length > 60 ? text.slice(0, 60) + '…' : text);
}

export function formatMessage(
  message: MessageRow,
  sender: Profile | null,
  isDeleted = false,
): FormattedMessage {
  const deleted = isDeleted || !!message.deleted_at;
  return {
    id: message.id,
    message_type: message.message_type || 'user',
    content: deleted ? '' : (message.content ?? ''),
    user_id: message.user_id,
    created_at: message.created_at,
    read_at: message.read_at,
    file_path: deleted ? null : message.file_path,
    file_type: deleted ? null : message.file_type,
    file_original_name: message.file_original_name,
    voice_duration: message.voice_duration,
    album_group_id: message.album_group_id,
    is_edited: message.is_edited,
    edited_at: message.edited_at,
    is_deleted: deleted,
    deleted_at: message.deleted_at,
    sender: sender
      ? {
          id: sender.id,
          name: sender.name,
          last_name: sender.last_name,
          avatar: sender.avatar,
        }
      : null,
  };
}

export function unreadCount(
  messages: MessageRow[],
  member: MemberRow | undefined,
  userId: string,
  isGroup: boolean,
): number {
  const lastRead = member?.last_read_at ? new Date(member.last_read_at).getTime() : 0;
  return messages.filter((m) => {
    if (m.deleted_at) return false;
    if ((m.message_type || 'user') !== 'user') return false;
    if (m.user_id === userId) return false;
    if (isGroup) {
      return new Date(m.created_at).getTime() > lastRead;
    }
    return !m.read_at;
  }).length;
}

export function formatConversationForList(
  conv: { id: number; type: string; title: string | null; allow_voice_messages: boolean; updated_at: string },
  members: (MemberRow & { profiles: Profile })[],
  messages: MessageRow[],
  userId: string,
): ConversationListItem {
  const selfMember = members.find((m) => m.user_id === userId);
  const isGroup = conv.type === 'group';
  const lastMsg = messages[0] ?? null;
  const albumCount = lastMsg?.album_group_id
    ? messages.filter((m) => m.album_group_id === lastMsg.album_group_id).length
    : 1;
  const count = unreadCount(messages, selfMember, userId, isGroup);
  const other = isGroup ? null : members.find((m) => m.user_id !== userId)?.profiles ?? null;

  return {
    id: conv.id,
    type: conv.type || 'private',
    title: isGroup ? conv.title : null,
    members_count: isGroup ? members.length : null,
    my_role: selfMember?.role || 'member',
    allow_voice_messages: isGroup ? conv.allow_voice_messages : null,
    other_user: other
      ? {
          id: other.id,
          name: other.name,
          last_name: other.last_name,
          avatar: other.avatar,
          is_online: isOnline(other.last_seen_at),
          last_seen_at: other.last_seen_at,
        }
      : null,
    last_message: lastMsg
      ? {
          id: lastMsg.id,
          content: lastMsg.content,
          user_id: lastMsg.user_id,
          created_at: lastMsg.created_at,
          file_path: lastMsg.file_path,
          file_type: lastMsg.file_type,
          file_original_name: lastMsg.file_original_name,
          voice_duration: lastMsg.voice_duration,
          album_group_id: lastMsg.album_group_id,
          album_count: albumCount,
          is_deleted: !!lastMsg.deleted_at,
        }
      : null,
    last_message_preview: lastMsg
      ? messagePreview(lastMsg, userId, albumCount)
      : '',
    unread_count: count,
    has_unread: count > 0,
    is_archived: selfMember?.is_archived ?? false,
    updated_at: conv.updated_at,
  };
}

export function resolveFileType(mime: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'voice';
  if (fileName.toLowerCase().startsWith('voice.')) return 'voice';
  if (['webm', 'ogg', 'mp3', 'm4a', 'wav', 'opus', 'aac'].includes(ext)) {
    if (ext === 'webm' && mime.startsWith('video/')) return 'voice';
    return 'voice';
  }
  return 'document';
}
