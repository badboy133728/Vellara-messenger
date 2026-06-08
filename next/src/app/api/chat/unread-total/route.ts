import { requireAuth } from '@/lib/auth';
import { unreadCount } from '@/lib/chat/formatters';
import type { MemberRow, MessageRow } from '@/lib/types';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const { data: memberships } = await supabase
    .from('conversation_members')
    .select('conversation_id, last_read_at, is_archived')
    .eq('user_id', user.id)
    .eq('is_archived', false);

  let total = 0;

  for (const m of memberships ?? []) {
    const { data: conv } = await supabase
      .from('conversations')
      .select('type')
      .eq('id', m.conversation_id)
      .single();

    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', m.conversation_id)
      .is('deleted_at', null);

    total += unreadCount(
      (messages ?? []) as MessageRow[],
      m as MemberRow,
      user.id,
      conv?.type === 'group',
    );
  }

  return Response.json({ total });
}
