import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';

const MAX_PINNED = 3;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const convId = Number((await params).conversationId);

  if (!Number.isFinite(convId) || convId <= 0) {
    return Response.json({ message: 'Некорректный id чата' }, { status: 422 });
  }

  if (!(await ensureMember(supabase, convId, user.id))) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  let body: { pinned?: boolean } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as { pinned?: boolean };
  } catch {
    return Response.json({ message: 'Некорректное тело запроса' }, { status: 422 });
  }

  const { data: member } = await supabase
    .from('conversation_members')
    .select('is_pinned, is_archived, hidden_at')
    .eq('conversation_id', convId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member || member.hidden_at) {
    return Response.json({ message: 'Чат не найден' }, { status: 404 });
  }

  const wantPinned = typeof body.pinned === 'boolean' ? body.pinned : !member.is_pinned;

  if (wantPinned && member.is_archived) {
    return Response.json({ message: 'Нельзя закрепить чат из архива' }, { status: 422 });
  }

  if (wantPinned && !member.is_pinned) {
    const { count } = await supabase
      .from('conversation_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_pinned', true)
      .is('hidden_at', null);

    if ((count ?? 0) >= MAX_PINNED) {
      return Response.json(
        { message: `Можно закрепить не более ${MAX_PINNED} чатов` },
        { status: 422 },
      );
    }
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('conversation_members')
    .update({
      is_pinned: wantPinned,
      pinned_at: wantPinned ? now : null,
    })
    .eq('conversation_id', convId)
    .eq('user_id', user.id);

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({
    is_pinned: wantPinned,
    pinned_at: wantPinned ? now : null,
  });
}
