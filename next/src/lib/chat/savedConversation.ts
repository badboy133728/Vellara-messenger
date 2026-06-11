import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export async function findSavedConversationId(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data: memberships } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userId);

  const convIds = (memberships ?? []).map((m) => m.conversation_id as number);
  if (!convIds.length) return null;

  const { data: convs } = await supabase
    .from('conversations')
    .select('id')
    .in('id', convIds)
    .eq('type', 'saved');

  if (!convs?.length) return null;

  for (const conv of convs) {
    const { count } = await supabase
      .from('conversation_members')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conv.id);

    if (count === 1) return conv.id as number;
  }

  return null;
}

export async function getOrCreateSavedConversation(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const existing = await findSavedConversationId(supabase, userId);
  if (existing) return existing;

  const admin = createAdminClient();
  const { data: conv, error: convError } = await admin
    .from('conversations')
    .insert({ type: 'saved', title: 'Избранное', created_by: userId })
    .select('id')
    .single();

  if (convError || !conv) {
    throw new Error(convError?.message ?? 'Не удалось создать избранное');
  }

  const { error: memberError } = await admin.from('conversation_members').insert({
    conversation_id: conv.id,
    user_id: userId,
    role: 'admin',
  });

  if (memberError) {
    throw new Error(memberError.message);
  }

  return conv.id as number;
}
