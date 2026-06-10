import { canManageChannel } from '@/lib/chat/permissions';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function assertCanPostToConversation(
  supabase: SupabaseClient,
  convId: number,
  userId: string,
  replyToId: number | null | undefined,
): Promise<string | null> {
  const { data: conv } = await supabase
    .from('conversations')
    .select('type, allow_comments')
    .eq('id', convId)
    .single();

  if (conv?.type !== 'channel') return null;

  const { data: member } = await supabase
    .from('conversation_members')
    .select('role')
    .eq('conversation_id', convId)
    .eq('user_id', userId)
    .single();

  if (canManageChannel(member?.role ?? 'member')) {
    return null;
  }

  if (!conv.allow_comments) {
    return 'В канале могут публиковать только администраторы';
  }

  if (!replyToId) {
    return 'Подписчики могут только комментировать посты канала';
  }

  const { data: parent } = await supabase
    .from('messages')
    .select('id, conversation_id, user_id, reply_to_id, message_type, deleted_at')
    .eq('id', replyToId)
    .maybeSingle();

  if (
    !parent ||
    parent.conversation_id !== convId ||
    parent.deleted_at ||
    parent.message_type !== 'user' ||
    parent.reply_to_id
  ) {
    return 'Можно комментировать только посты канала';
  }

  const { data: parentAuthor } = await supabase
    .from('conversation_members')
    .select('role')
    .eq('conversation_id', convId)
    .eq('user_id', parent.user_id)
    .single();

  if (!canManageChannel(parentAuthor?.role ?? 'member')) {
    return 'Можно комментировать только посты канала';
  }

  return null;
}
