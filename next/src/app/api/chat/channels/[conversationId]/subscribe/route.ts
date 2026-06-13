import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user } = auth;
  const convId = Number((await params).conversationId);

  if (!Number.isFinite(convId) || convId <= 0) {
    return Response.json({ message: 'Некорректный id канала' }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: channel } = await admin
    .from('conversations')
    .select('id, is_public')
    .eq('id', convId)
    .eq('type', 'channel')
    .maybeSingle();

  if (!channel) {
    return Response.json({ message: 'Канал не найден' }, { status: 404 });
  }

  const { data: existing } = await admin
    .from('conversation_members')
    .select('id, hidden_at, is_archived')
    .eq('conversation_id', convId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    if (!existing.hidden_at && !existing.is_archived) {
      return Response.json({ subscribed: true, already: true });
    }

    const { error: restoreError } = await admin
      .from('conversation_members')
      .update({
        hidden_at: null,
        is_archived: false,
      })
      .eq('conversation_id', convId)
      .eq('user_id', user.id);

    if (restoreError) {
      return Response.json({ message: restoreError.message }, { status: 500 });
    }

    return Response.json({ subscribed: true, restored: true });
  }

  if (channel.is_public === false) {
    return Response.json(
      { message: 'Приватный канал доступен только по приглашению администратора' },
      { status: 403 },
    );
  }

  const { error: insertError } = await admin.from('conversation_members').insert({
    conversation_id: convId,
    user_id: user.id,
    role: 'member',
    is_archived: false,
    hidden_at: null,
  });

  if (insertError) {
    return Response.json({ message: insertError.message }, { status: 500 });
  }

  return Response.json({ subscribed: true });
}
