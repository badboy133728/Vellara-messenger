import { requireAuth } from '@/lib/auth';
import { formatConversationForList } from '@/lib/chat/formatters';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MemberRow, MessageRow, Profile } from '@/lib/types';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description =
    typeof body.description === 'string' ? body.description.trim().slice(0, 500) : '';
  const allowComments = !!body.allow_comments;
  const subscriberIds = Array.isArray(body.subscriber_ids)
    ? [...new Set((body.subscriber_ids as string[]).filter((id) => id && id !== user.id))]
    : [];

  if (!title || title.length < 2 || title.length > 100) {
    return Response.json({ message: 'Название 2–100 символов' }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: conv, error } = await admin
    .from('conversations')
    .insert({
      type: 'channel',
      title,
      description: description || null,
      allow_comments: allowComments,
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error || !conv) {
    return Response.json({ message: error?.message ?? 'Ошибка' }, { status: 500 });
  }

  const rows = [
    { conversation_id: conv.id, user_id: user.id, role: 'admin' },
    ...subscriberIds.map((id) => ({
      conversation_id: conv.id,
      user_id: id,
      role: 'member',
    })),
  ];
  const { error: membersError } = await admin.from('conversation_members').insert(rows);
  if (membersError) {
    return Response.json({ message: membersError.message }, { status: 500 });
  }

  await supabase.from('messages').insert({
    conversation_id: conv.id,
    user_id: user.id,
    message_type: 'system',
    content: `${auth.profile.name} создал(а) канал «${title}»`,
  });

  const { data: memberRows } = await supabase
    .from('conversation_members')
    .select('*, profiles(*)')
    .eq('conversation_id', conv.id);

  const typedMembers = (memberRows ?? []).map((m) => ({
    ...m,
    profiles: m.profiles as Profile,
  })) as (MemberRow & { profiles: Profile })[];

  return Response.json(
    {
      message: 'Канал создан',
      conversation: formatConversationForList(conv, typedMembers, [] as MessageRow[], user.id),
    },
    { status: 201 },
  );
}
