import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { canManageChannel } from '@/lib/chat/permissions';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, profile, supabase } = auth;
  const convId = Number((await params).conversationId);

  if (!Number.isFinite(convId) || convId <= 0) {
    return Response.json({ message: 'Некорректный id канала' }, { status: 422 });
  }

  if (!(await ensureMember(supabase, convId, user.id))) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  const { data: conv } = await supabase
    .from('conversations')
    .select('id, type')
    .eq('id', convId)
    .eq('type', 'channel')
    .maybeSingle();

  if (!conv) {
    return Response.json({ message: 'Канал не найден' }, { status: 404 });
  }

  const { data: myMember } = await supabase
    .from('conversation_members')
    .select('role')
    .eq('conversation_id', convId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!canManageChannel(myMember?.role ?? 'member')) {
    return Response.json({ message: 'Только администратор канала может передавать права' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const targetUserId = typeof body.target_user_id === 'string' ? body.target_user_id : '';
  if (!targetUserId) {
    return Response.json({ message: 'Укажите получателя прав администратора' }, { status: 422 });
  }
  if (targetUserId === user.id) {
    return Response.json({ message: 'Нельзя передать права самому себе' }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: targetMember } = await admin
    .from('conversation_members')
    .select('role')
    .eq('conversation_id', convId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (!targetMember) {
    return Response.json({ message: 'Пользователь не является подписчиком канала' }, { status: 404 });
  }
  if (targetMember.role === 'admin') {
    return Response.json({ message: 'Этот пользователь уже администратор канала' }, { status: 422 });
  }

  const { error: promoteError } = await admin
    .from('conversation_members')
    .update({ role: 'admin' })
    .eq('conversation_id', convId)
    .eq('user_id', targetUserId);
  if (promoteError) {
    return Response.json({ message: promoteError.message }, { status: 500 });
  }

  const { error: demoteError } = await admin
    .from('conversation_members')
    .update({ role: 'member' })
    .eq('conversation_id', convId)
    .eq('user_id', user.id);
  if (demoteError) {
    return Response.json({ message: demoteError.message }, { status: 500 });
  }

  const { data: targetProfile } = await admin
    .from('profiles')
    .select('name, last_name')
    .eq('id', targetUserId)
    .maybeSingle();

  const targetName =
    `${targetProfile?.name ?? ''} ${targetProfile?.last_name ?? ''}`.trim() || 'пользователю';

  await supabase.from('messages').insert({
    conversation_id: convId,
    user_id: user.id,
    message_type: 'system',
    content: `${profile.name} передал(а) права администратора ${targetName}`,
  });

  return Response.json({ message: 'Права администратора переданы', target_user_id: targetUserId });
}
