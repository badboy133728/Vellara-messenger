import { requireAuth } from '@/lib/auth';
import { formatConversationForList } from '@/lib/chat/formatters';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MemberRow, MessageRow, Profile } from '@/lib/types';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const body = await request.json();
  const { title, member_ids } = body;

  if (!title || title.length < 2 || title.length > 100) {
    return Response.json({ message: 'Название 2–100 символов' }, { status: 422 });
  }
  if (!Array.isArray(member_ids) || member_ids.length < 1) {
    return Response.json({ message: 'Добавьте хотя бы одного участника' }, { status: 422 });
  }

  const members = [...new Set(member_ids as string[])].filter((id) => id !== user.id);
  if (members.length === 0) {
    return Response.json({ message: 'Добавьте хотя бы одного участника' }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: conv, error } = await admin
    .from('conversations')
    .insert({ type: 'group', title, created_by: user.id })
    .select('*')
    .single();

  if (error || !conv) {
    return Response.json({ message: error?.message ?? 'Ошибка' }, { status: 500 });
  }

  const rows = [
    { conversation_id: conv.id, user_id: user.id, role: 'admin' },
    ...members.map((id) => ({ conversation_id: conv.id, user_id: id, role: 'member' })),
  ];
  const { error: membersError } = await admin.from('conversation_members').insert(rows);
  if (membersError) {
    return Response.json({ message: membersError.message }, { status: 500 });
  }

  await supabase.from('messages').insert({
    conversation_id: conv.id,
    user_id: user.id,
    message_type: 'system',
    content: `${auth.profile.name} создал(а) группу «${title}»`,
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
      message: 'Группа создана',
      conversation: formatConversationForList(conv, typedMembers, [] as MessageRow[], user.id),
    },
    { status: 201 },
  );
}
