import type { SupabaseClient } from '@supabase/supabase-js';

/** Показать чат снова в списке у получателей при новом сообщении. */
export async function unhideConversationForRecipients(
  supabase: SupabaseClient,
  convId: number,
  senderId: string,
) {
  await supabase
    .from('conversation_members')
    .update({ hidden_at: null })
    .eq('conversation_id', convId)
    .neq('user_id', senderId)
    .not('hidden_at', 'is', null);
}
