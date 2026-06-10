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
  const allowComments = !!body.allow_comments;

  await supabase
    .from('conversations')
    .update({ allow_comments: allowComments })
    .eq('id', convId);

  return Response.json({
    message: 'Настройки сохранены',
    allow_comments: allowComments,
  });
}
