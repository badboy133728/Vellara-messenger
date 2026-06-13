import { requireAuth } from '@/lib/auth';
import { formatMessagesWithReplies } from '@/lib/chat/messageList';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MessageRow, Profile } from '@/lib/types';

export async function GET(
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
    .select('id, title, description, allow_comments, is_public, updated_at')
    .eq('id', convId)
    .eq('type', 'channel')
    .maybeSingle();

  if (!channel) {
    return Response.json({ message: 'Канал не найден' }, { status: 404 });
  }

  const [{ data: members }, { data: myMembership }, { data: posts }] = await Promise.all([
    admin
      .from('conversation_members')
      .select('user_id, hidden_at, is_archived')
      .eq('conversation_id', convId),
    admin
      .from('conversation_members')
      .select('id, hidden_at, is_archived')
      .eq('conversation_id', convId)
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .eq('message_type', 'user')
      .is('reply_to_id', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const activeMembersCount = (members ?? []).filter(
    (m) => !m.hidden_at && !m.is_archived,
  ).length;

  const userIds = [...new Set((posts ?? []).map((m) => m.user_id as string))];
  const { data: profiles } = userIds.length
    ? await admin
        .from('profiles')
        .select('id, name, last_name, avatar')
        .in('id', userIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
  const formattedPosts = await formatMessagesWithReplies(
    (posts ?? []) as MessageRow[],
    profileMap,
    admin,
  );

  const isSubscribed = !!(
    myMembership &&
    !myMembership.hidden_at &&
    !myMembership.is_archived
  );

  if (channel.is_public === false && !myMembership) {
    return Response.json(
      { message: 'Этот канал приватный и доступен только по приглашению администратора' },
      { status: 403 },
    );
  }

  return Response.json({
    id: channel.id,
    title: channel.title ?? 'Канал',
    description: channel.description ?? null,
    allow_comments: !!channel.allow_comments,
    is_public: channel.is_public !== false,
    updated_at: channel.updated_at,
    members_count: activeMembersCount,
    is_subscribed: isSubscribed,
    posts: formattedPosts,
  });
}
