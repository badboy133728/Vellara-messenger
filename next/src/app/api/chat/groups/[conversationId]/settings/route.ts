import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { canManageGroup } from '@/lib/chat/permissions';

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

  const { data: member } = await supabase
    .from('conversation_members')
    .select('role')
    .eq('conversation_id', convId)
    .eq('user_id', user.id)
    .single();

  if (!canManageGroup(member?.role ?? 'member')) {
    return Response.json({ message: 'Только администратор' }, { status: 403 });
  }

  const { allow_voice_messages } = await request.json();

  await supabase
    .from('conversations')
    .update({ allow_voice_messages: !!allow_voice_messages })
    .eq('id', convId);

  return Response.json({
    message: 'Настройки сохранены',
    allow_voice_messages: !!allow_voice_messages,
  });
}
