import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const messageId = Number((await params).messageId);

  const { data: message } = await supabase.from('messages').select('*').eq('id', messageId).single();
  if (!message) return Response.json({ message: 'Не найдено' }, { status: 404 });

  if (!(await ensureMember(supabase, message.conversation_id, user.id))) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  if (message.message_type === 'system') {
    return Response.json({ message: 'Системные сообщения нельзя сохранять' }, { status: 422 });
  }

  const { data: existing } = await supabase
    .from('saved_messages')
    .select('id')
    .eq('user_id', user.id)
    .eq('message_id', messageId)
    .maybeSingle();

  if (existing) {
    await supabase.from('saved_messages').delete().eq('id', existing.id);
    return Response.json({ saved: false, message: 'Убрано из избранного' });
  }

  await supabase.from('saved_messages').insert({ user_id: user.id, message_id: messageId });
  return Response.json({ saved: true, message: 'Сохранено в избранное' });
}
