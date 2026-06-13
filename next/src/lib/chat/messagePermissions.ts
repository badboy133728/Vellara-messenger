import { canManageChannel, canManageGroup } from '@/lib/chat/permissions';
import type { MessageRow } from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function resolveCanDeleteMessage(
  supabase: SupabaseClient,
  userId: string,
  message: Pick<MessageRow, 'user_id' | 'conversation_id' | 'reply_to_id'>,
): Promise<boolean> {
  const isOwn = message.user_id === userId;

  const [{ data: conv }, { data: actor }] = await Promise.all([
    supabase.from('conversations').select('type').eq('id', message.conversation_id).single(),
    supabase
      .from('conversation_members')
      .select('role')
      .eq('conversation_id', message.conversation_id)
      .eq('user_id', userId)
      .single(),
  ]);

  const role = actor?.role ?? 'member';
  const convType = conv?.type ?? 'private';

  if (convType === 'channel') {
    const isPost = !message.reply_to_id;
    if (canManageChannel(role)) return true;
    if (isPost) return false;
    return isOwn;
  }

  if (convType === 'group' && canManageGroup(role)) return true;
  return isOwn;
}

export async function resolveCanEditMessage(
  supabase: SupabaseClient,
  userId: string,
  message: Pick<MessageRow, 'user_id' | 'conversation_id' | 'reply_to_id'>,
): Promise<boolean> {
  if (message.user_id === userId) return true;

  const [{ data: conv }, { data: actor }] = await Promise.all([
    supabase.from('conversations').select('type').eq('id', message.conversation_id).single(),
    supabase
      .from('conversation_members')
      .select('role')
      .eq('conversation_id', message.conversation_id)
      .eq('user_id', userId)
      .single(),
  ]);

  const role = actor?.role ?? 'member';
  const convType = conv?.type ?? 'private';

  if (convType === 'group' && canManageGroup(role)) return true;
  if (convType === 'channel' && canManageChannel(role) && !!message.reply_to_id) {
    return true;
  }

  return false;
}
