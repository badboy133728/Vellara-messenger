import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';

/** Скрыть чат из списка для текущего пользователя. */
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

  return Response.json({ hidden: true, hidden_at: now });
}
