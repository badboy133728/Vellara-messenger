import { requireAuth, isOnline } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { canManageChannel } from '@/lib/chat/permissions';
import { uploadConversationAvatar } from '@/lib/storage-server';
import { createAdminClient } from '@/lib/supabase/admin';

async function loadChannel(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  convId: number,
  userId: string,
) {
  if (!(await ensureMember(supabase, convId, userId))) return null;

  const { data: conv } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', convId)
    .eq('type', 'channel')
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
    type: 'channel',
    title: conv.title,
    avatar: conv.avatar ?? null,
    description: conv.description ?? null,
    my_role: myRole,
    allow_comments: !!conv.allow_comments,
    is_public: conv.is_public !== false,
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

  const detail = await loadChannel(supabase, convId, user.id);
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

  const detail = await loadChannel(supabase, convId, user.id);
  if (!detail) return Response.json({ message: 'Нет доступа' }, { status: 403 });
  if (!canManageChannel(detail.my_role)) {
    return Response.json({ message: 'Только администратор канала' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  const patch: Record<string, unknown> = {};
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const titleEntry = formData.get('title');
    const descriptionEntry = formData.get('description');
    const clearAvatar = formData.get('clear_avatar') === '1';
    const avatarEntry = formData.get('avatar');
    const avatarFile = avatarEntry instanceof File && avatarEntry.size > 0 ? avatarEntry : null;

    if (typeof titleEntry === 'string') {
      const title = titleEntry.trim();
      if (title.length < 2 || title.length > 100) {
        return Response.json({ message: 'Некорректное название' }, { status: 422 });
      }
      patch.title = title;
    }
    if (typeof descriptionEntry === 'string') {
      patch.description = descriptionEntry.trim().slice(0, 500) || null;
    }
    if (clearAvatar) patch.avatar = null;
    if (avatarFile) {
      try {
        patch.avatar = await uploadConversationAvatar(convId, avatarFile);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Ошибка загрузки аватара';
        return Response.json({ message }, { status: 500 });
      }
    }
  } else {
    const body = await request.json().catch(() => ({}));
    if (typeof body.title === 'string') {
      const title = body.title.trim();
      if (title.length < 2 || title.length > 100) {
        return Response.json({ message: 'Некорректное название' }, { status: 422 });
      }
      patch.title = title;
    }
    if (typeof body.description === 'string') {
      patch.description = body.description.trim().slice(0, 500) || null;
    }
    if (body.clear_avatar === true) {
      patch.avatar = null;
    }
  }

  if (!Object.keys(patch).length) {
    return Response.json({ message: 'Нечего обновлять' }, { status: 422 });
  }

  await supabase.from('conversations').update(patch).eq('id', convId);

  if (patch.title) {
    await supabase.from('messages').insert({
      conversation_id: convId,
      user_id: user.id,
      message_type: 'system',
      content: `${profile.name} изменил(а) название канала на «${patch.title}»`,
    });
  }

  return Response.json({
    message: 'Канал обновлён',
    title: patch.title ?? detail.title,
    description: patch.description ?? detail.description,
    avatar: patch.avatar ?? detail.avatar ?? null,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const convId = Number((await params).conversationId);

  const detail = await loadChannel(supabase, convId, user.id);
  if (!detail) return Response.json({ message: 'Нет доступа' }, { status: 403 });
  if (!canManageChannel(detail.my_role)) {
    return Response.json({ message: 'Только администратор канала' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('conversations')
    .delete()
    .eq('id', convId)
    .eq('type', 'channel');

  if (error) {
    return Response.json({ message: 'Не удалось удалить канал' }, { status: 500 });
  }

  return Response.json({ message: 'Канал удалён' });
}
