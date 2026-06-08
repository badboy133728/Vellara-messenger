import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const { conversationId } = await params;
  const convId = Number(conversationId);

  if (!(await ensureMember(supabase, convId, user.id))) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  const { data: member } = await supabase
    .from('conversation_members')
    .select('is_archived')
    .eq('conversation_id', convId)
    .eq('user_id', user.id)
    .single();

  const next = !member?.is_archived;

  await supabase
    .from('conversation_members')
    .update({ is_archived: next })
    .eq('conversation_id', convId)
    .eq('user_id', user.id);

  return Response.json({ is_archived: next });
}
