import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export async function getOrCreatePrivateConversation(
  supabase: SupabaseClient,
  userId: string,
  otherUserId: string,
) {
  const { data: myMemberships } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userId);

  const myConvIds = (myMemberships ?? []).map((m) => m.conversation_id);

  if (myConvIds.length > 0) {
    const { data: shared } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', otherUserId)
      .in('conversation_id', myConvIds);

    for (const row of shared ?? []) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id, type')
        .eq('id', row.conversation_id)
        .eq('type', 'private')
        .single();

      if (!conv) continue;

      const { count } = await supabase
        .from('conversation_members')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conv.id);

      if (count === 2) {
        return { id: conv.id, created: false };
      }
    }
  }

  // Admin: после insert пользователь ещё не member → RLS блокирует .select() на conversations.
  const admin = createAdminClient();
  const { data: conv, error: convError } = await admin
    .from('conversations')
    .insert({ type: 'private', created_by: userId })
    .select('id')
    .single();

  if (convError || !conv) {
    throw new Error(convError?.message ?? 'Failed to create conversation');
  }

  const { error: membersError } = await admin.from('conversation_members').insert([
    { conversation_id: conv.id, user_id: userId, role: 'member' },
    { conversation_id: conv.id, user_id: otherUserId, role: 'member' },
  ]);

  if (membersError) {
    throw new Error(membersError.message);
  }

  return { id: conv.id, created: true };
}

export async function ensureMember(
  supabase: SupabaseClient,
  conversationId: number,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('conversation_members')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}
