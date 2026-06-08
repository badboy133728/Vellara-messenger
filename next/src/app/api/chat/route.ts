import { requireAuth } from '@/lib/auth';
import { formatConversationForList } from '@/lib/chat/formatters';
import type { MemberRow, MessageRow, Profile } from '@/lib/types';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const { data: memberships } = await supabase
    .from('conversation_members')
    .select('conversation_id, role, last_read_at, is_archived')
    .eq('user_id', user.id);

  if (!memberships?.length) return Response.json([]);

  const convIds = memberships.map((m) => m.conversation_id);
  const messagesLimit = Math.min(convIds.length * 50, 800);

  const [{ data: conversations }, { data: allMembers }, { data: recentMessages }] = await Promise.all([
    supabase
      .from('conversations')
      .select('*')
      .in('id', convIds)
      .order('updated_at', { ascending: false }),
    supabase
      .from('conversation_members')
      .select('*, profiles(*)')
      .in('conversation_id', convIds),
    supabase
      .from('messages')
      .select('*')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(messagesLimit),
  ]);

  const membersByConv = new Map<number, (MemberRow & { profiles: Profile })[]>();
  for (const row of allMembers ?? []) {
    const convId = row.conversation_id as number;
    const list = membersByConv.get(convId) ?? [];
    list.push({
      ...row,
      profiles: row.profiles as Profile,
    } as MemberRow & { profiles: Profile });
    membersByConv.set(convId, list);
  }

  const messagesByConv = new Map<number, MessageRow[]>();
  for (const row of recentMessages ?? []) {
    const msg = row as MessageRow;
    const list = messagesByConv.get(msg.conversation_id) ?? [];
    if (list.length < 50) {
      list.push(msg);
      messagesByConv.set(msg.conversation_id, list);
    }
  }

  const result = (conversations ?? []).map((conv) =>
    formatConversationForList(
      conv,
      membersByConv.get(conv.id) ?? [],
      messagesByConv.get(conv.id) ?? [],
      user.id,
    ),
  );

  return Response.json(result);
}
