import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { canManageChannel } from '@/lib/chat/permissions';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const convId = Number((await params).conversationId);

  if (!(await ensureMember(supabase, convId, user.id))) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  const { data: conv } = await supabase
    .from('conversations')
    .select('type')
    .eq('id', convId)
    .eq('type', 'channel')
    .single();

  if (!conv) {
    return Response.json({ message: 'Канал не найден' }, { status: 404 });
  }

  const { data: member } = await supabase
    .from('conversation_members')
    .select('role')
    .eq('conversation_id', convId)
    .eq('user_id', user.id)
    .single();

  if (!canManageChannel(member?.role ?? 'member')) {
    return Response.json({ message: 'Только администратор канала' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const patch: { allow_comments?: boolean; is_public?: boolean } = {};
  if (typeof body.allow_comments === 'boolean') {
    patch.allow_comments = body.allow_comments;
  }
  if (typeof body.is_public === 'boolean') {
    patch.is_public = body.is_public;
  }
  if (!Object.keys(patch).length) {
    return Response.json({ message: 'Нет настроек для сохранения' }, { status: 422 });
  }

  await supabase
    .from('conversations')
    .update(patch)
    .eq('id', convId);

  const { data: updated } = await supabase
    .from('conversations')
    .select('allow_comments, is_public')
    .eq('id', convId)
    .single();

  return Response.json({
    message: 'Настройки сохранены',
    allow_comments: !!updated?.allow_comments,
    is_public: updated?.is_public !== false,
  });
}
