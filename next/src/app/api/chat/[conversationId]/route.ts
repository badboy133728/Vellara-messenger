import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Delete behavior:
 * - private chat: hard-delete conversation for both participants;
 * - other chat types: hide only for current user.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const convId = Number((await params).conversationId);

  if (!Number.isFinite(convId) || convId <= 0) {
    return Response.json({ message: 'Некорректный id чата' }, { status: 422 });
  }

  if (!(await ensureMember(supabase, convId, user.id))) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, type')
    .eq('id', convId)
    .maybeSingle();

  if (!conv) {
    return Response.json({ message: 'Чат не найден' }, { status: 404 });
  }

  if (conv.type === 'private') {
    const { count } = await supabase
      .from('conversation_members')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', convId);

    if (!count || count < 2) {
      return Response.json({ message: 'Некорректный состав приватного чата' }, { status: 422 });
    }

    const admin = createAdminClient();
    const { error: deleteError } = await admin
      .from('conversations')
      .delete()
      .eq('id', convId)
      .eq('type', 'private');

    if (deleteError) {
      return Response.json({ message: deleteError.message }, { status: 500 });
    }

    return Response.json({ deleted: true, scope: 'all_participants' });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('conversation_members')
    .update({
      hidden_at: now,
      is_pinned: false,
      pinned_at: null,
    })
    .eq('conversation_id', convId)
    .eq('user_id', user.id);

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({ hidden: true, hidden_at: now, scope: 'self' });
}
