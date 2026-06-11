import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { canManageGroup } from '@/lib/chat/permissions';

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

  const { data: member } = await supabase
    .from('conversation_members')
    .select('role')
    .eq('conversation_id', convId)
    .eq('user_id', user.id)
    .single();

  if (!canManageGroup(member?.role ?? 'member')) {
    return Response.json({ message: 'Только администратор' }, { status: 403 });
  }

  const { member_ids } = await request.json();
  if (!Array.isArray(member_ids) || member_ids.length === 0) {
    return Response.json({ message: 'Укажите участников' }, { status: 422 });
  }

  const { data: existing } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', convId);

  const existingIds = new Set((existing ?? []).map((e) => e.user_id));
  const toAdd = (member_ids as string[]).filter((id) => !existingIds.has(id));

  if (toAdd.length === 0) {
    return Response.json({ message: 'Все пользователи уже в группе' }, { status: 422 });
  }

  await supabase.from('conversation_members').insert(
    toAdd.map((id) => ({ conversation_id: convId, user_id: id, role: 'member' })),
  );

  await supabase.from('messages').insert({
    conversation_id: convId,
    user_id: user.id,
    message_type: 'system',
    content: `${profile.name} добавил(а) участников`,
  });

  return Response.json({ message: 'Участники добавлены' });
}
