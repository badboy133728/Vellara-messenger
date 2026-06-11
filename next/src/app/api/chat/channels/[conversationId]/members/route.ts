import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { canManageChannel } from '@/lib/chat/permissions';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, profile, supabase } = auth;
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

  const { subscriber_ids } = await request.json().catch(() => ({}));
  if (!Array.isArray(subscriber_ids) || subscriber_ids.length === 0) {
    return Response.json({ message: 'Укажите подписчиков' }, { status: 422 });
  }

  const { data: existing } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', convId);

  const existingIds = new Set((existing ?? []).map((e) => e.user_id));
  const toAdd = (subscriber_ids as string[]).filter((id) => id && !existingIds.has(id));

  if (toAdd.length === 0) {
    return Response.json({ message: 'Все пользователи уже подписаны' }, { status: 422 });
  }

  await supabase.from('conversation_members').insert(
    toAdd.map((id) => ({ conversation_id: convId, user_id: id, role: 'member' })),
  );

  await supabase.from('messages').insert({
    conversation_id: convId,
    user_id: user.id,
    message_type: 'system',
    content: `${profile.name} добавил(а) подписчиков`,
  });

  return Response.json({ message: 'Подписчики добавлены' });
}
