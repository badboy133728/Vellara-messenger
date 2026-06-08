import { requireAuth, isOnline } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { canManageGroup } from '@/lib/chat/permissions';
import { createAdminClient } from '@/lib/supabase/admin';

async function loadGroup(supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>, convId: number, userId: string) {
  if (!(await ensureMember(supabase, convId, userId))) return null;

  const { data: conv } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', convId)
    .eq('type', 'group')
    .single();

  if (!conv) return null;

  const { data: members } = await supabase
    .from('conversation_members')
    .select('user_id, role, last_read_at')
    .eq('conversation_id', convId);

  const memberIds = (members ?? []).map((m) => m.user_id);
  const admin = createAdminClient();
  const { data: profiles } = memberIds.length
    ? await admin.from('profiles').select('id, name, last_name, avatar, last_seen_at').in('id', memberIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const myRole = members?.find((m) => m.user_id === userId)?.role ?? 'member';

  return {
    id: conv.id,
    type: 'group',
    title: conv.title,
    my_role: myRole,
    allow_voice_messages: conv.allow_voice_messages,
    members_count: members?.length ?? 0,
    members: (members ?? []).map((m) => {
      const p = profileMap.get(m.user_id);
      return {
        id: m.user_id,
        name: p?.name ?? '',
        last_name: p?.last_name ?? '',
        avatar: p?.avatar ?? null,
        role: m.role,
        is_online: isOnline(p?.last_seen_at ?? null),
        last_read_at: m.last_read_at,
      };
    }),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const convId = Number((await params).conversationId);

  const detail = await loadGroup(supabase, convId, user.id);
  if (!detail) return Response.json({ message: 'Нет доступа' }, { status: 403 });
  return Response.json(detail);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, profile, supabase } = auth;
  const convId = Number((await params).conversationId);

  const detail = await loadGroup(supabase, convId, user.id);
  if (!detail) return Response.json({ message: 'Нет доступа' }, { status: 403 });
  if (!canManageGroup(detail.my_role)) {
    return Response.json({ message: 'Только администратор' }, { status: 403 });
  }

  const { title } = await request.json();
  if (!title || title.length < 2) {
    return Response.json({ message: 'Некорректное название' }, { status: 422 });
  }

  await supabase.from('conversations').update({ title }).eq('id', convId);
  await supabase.from('messages').insert({
    conversation_id: convId,
    user_id: user.id,
    message_type: 'system',
    content: `${profile.name} изменил(а) название группы на «${title}»`,
  });

  return Response.json({ message: 'Название обновлено', title });
}
