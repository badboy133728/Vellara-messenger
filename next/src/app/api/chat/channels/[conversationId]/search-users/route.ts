import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { canManageChannel } from '@/lib/chat/permissions';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const convId = Number((await params).conversationId);
  const query = (new URL(request.url).searchParams.get('query') ?? '').trim();

  if (!(await ensureMember(supabase, convId, user.id))) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
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

  if (query.length < 2) return Response.json([]);

  const { data: memberIds } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', convId);

  const exclude = new Set([user.id, ...(memberIds ?? []).map((m) => m.user_id)]);

  const { data: users } = await supabase
    .from('profiles')
    .select('id, name, last_name, email, avatar')
    .or(`name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(15);

  return Response.json((users ?? []).filter((u) => !exclude.has(u.id)));
}
