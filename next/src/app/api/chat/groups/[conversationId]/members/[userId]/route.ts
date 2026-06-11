import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { canManageGroup } from '@/lib/chat/permissions';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ conversationId: string; userId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const { conversationId, userId: targetId } = await params;
  const convId = Number(conversationId);

  if (!(await ensureMember(supabase, convId, user.id))) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  const { data: myMember } = await supabase
    .from('conversation_members')
    .select('role')
    .eq('conversation_id', convId)
    .eq('user_id', user.id)
    .single();

  if (!canManageGroup(myMember?.role ?? 'member')) {
    return Response.json({ message: 'Только администратор' }, { status: 403 });
  }

  const { role } = await request.json();
  if (!['admin', 'member'].includes(role)) {
    return Response.json({ message: 'Некорректная роль' }, { status: 422 });
  }

  await supabase
    .from('conversation_members')
    .update({ role })
    .eq('conversation_id', convId)
    .eq('user_id', targetId);

  return Response.json({ message: 'Роль обновлена' });
}

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

  if (!isSelfLeave) {
    const { data: myMember } = await supabase
      .from('conversation_members')
      .select('role')
      .eq('conversation_id', convId)
      .eq('user_id', user.id)
      .single();

    if (!canManageGroup(myMember?.role ?? 'member')) {
      return Response.json({ message: 'Недостаточно прав' }, { status: 403 });
    }
  }

  await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', convId)
    .eq('user_id', targetId);

  const text = isSelfLeave
    ? `${profile.name} вышел(а) из группы`
    : `${profile.name} исключил(а) участника`;

  await supabase.from('messages').insert({
    conversation_id: convId,
    user_id: user.id,
    message_type: 'system',
    content: text,
  });

  return Response.json({ message: isSelfLeave ? 'Вы вышли из группы' : 'Участник удалён' });
}
