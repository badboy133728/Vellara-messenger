import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { canManageChannel } from '@/lib/chat/permissions';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string; userId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, profile, supabase } = auth;
  const { conversationId, userId: targetId } = await params;
  const convId = Number(conversationId);
  const isSelfLeave = user.id === targetId;

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

  const { data: targetMember } = await supabase
    .from('conversation_members')
    .select('role')
    .eq('conversation_id', convId)
    .eq('user_id', targetId)
    .single();

  if (!targetMember) {
    return Response.json({ message: 'Подписчик не найден' }, { status: 404 });
  }

  if (!isSelfLeave) {
    const { data: myMember } = await supabase
      .from('conversation_members')
      .select('role')
      .eq('conversation_id', convId)
      .eq('user_id', user.id)
      .single();

    if (!canManageChannel(myMember?.role ?? 'member')) {
      return Response.json({ message: 'Недостаточно прав' }, { status: 403 });
    }
    if (targetMember.role === 'admin') {
      return Response.json(
        { message: 'Нельзя удалить администратора. Сначала передайте права.' },
        { status: 422 },
      );
    }
  } else if (canManageChannel(
    targetMember.role,
  )) {
    return Response.json(
      { message: 'Создатель канала не может отписаться. Удалите канал или передайте права.' },
      { status: 422 },
    );
  }

  await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', convId)
    .eq('user_id', targetId);

  const text = isSelfLeave
    ? `${profile.name} отписался(ась) от канала`
    : `${profile.name} удалил(а) подписчика`;

  await supabase.from('messages').insert({
    conversation_id: convId,
    user_id: user.id,
    message_type: 'system',
    content: text,
  });

  return Response.json({ message: isSelfLeave ? 'Вы отписались' : 'Подписчик удалён' });
}
