import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { broadcastToConversation } from '@/lib/realtime/broadcast';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const { conversationId } = await params;
  const convId = Number(conversationId);

  if (!(await ensureMember(supabase, convId, user.id))) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();

  const { data: conv } = await admin
    .from('conversations')
    .select('type')
    .eq('id', convId)
    .single();

  if (conv?.type === 'group') {
    await admin
      .from('conversation_members')
      .update({ last_read_at: now })
      .eq('conversation_id', convId)
      .eq('user_id', user.id);

    void broadcastToConversation(supabase, convId, 'MemberRead', {
      conversation_id: convId,
      user_id: user.id,
      last_read_at: now,
    });

    return Response.json({ success: true, updated: 0, unread_count: 0, read_at: now });
  }

  const { data: unread } = await admin
    .from('messages')
    .select('id')
    .eq('conversation_id', convId)
    .eq('message_type', 'user')
    .neq('user_id', user.id)
    .is('read_at', null);

  const messageIds = (unread ?? []).map((m) => m.id);
  let updated = 0;

  if (messageIds.length > 0) {
    const { data } = await admin
      .from('messages')
      .update({ read_at: now })
      .in('id', messageIds)
      .select('id');
    updated = data?.length ?? 0;
  }

  await admin
    .from('conversation_members')
    .update({ last_read_at: now })
    .eq('conversation_id', convId)
    .eq('user_id', user.id);

  if (updated > 0) {
    void broadcastToConversation(supabase, convId, 'MessagesRead', {
      conversation_id: convId,
      reader_id: user.id,
      read_at: now,
      message_ids: messageIds,
    });
  }

  return Response.json({
    success: true,
    updated,
    unread_count: 0,
    message_ids: messageIds,
    read_at: now,
  });
}
