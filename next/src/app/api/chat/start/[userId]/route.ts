import { requireAuth } from '@/lib/auth';
import { getOrCreatePrivateConversation } from '@/lib/chat/conversations';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const { userId: otherUserId } = await params;

  if (user.id === otherUserId) {
    return Response.json({ message: 'Нельзя чатиться с собой' }, { status: 422 });
  }

  const { data: other } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', otherUserId)
    .maybeSingle();

  if (!other) {
    return Response.json({ message: 'Пользователь не найден' }, { status: 404 });
  }

  try {
    const result = await getOrCreatePrivateConversation(supabase, user.id, otherUserId);
    return Response.json({
      id: result.id,
      status: result.created ? 'created' : 'exists',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не удалось создать чат';
    return Response.json({ message }, { status: 500 });
  }
}
