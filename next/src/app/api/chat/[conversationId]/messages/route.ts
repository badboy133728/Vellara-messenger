import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { formatMessagesWithReplies } from '@/lib/chat/messageList';
import { canManageGroup } from '@/lib/chat/permissions';
import { broadcastToConversation } from '@/lib/realtime/broadcast';
import { notifyConversationPush } from '@/lib/push/notify';
import { uploadMessageFile } from '@/lib/storage-server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MessageRow, Profile } from '@/lib/types';
import { applyGroupReadStatuses, type MemberRead } from '@/utils/groupReadStatus';

export async function GET(
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

  const { data: recent } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: false })
    .limit(50);

  const messageRows = [...(recent ?? [])].reverse() as MessageRow[];
  const userIds = [...new Set(messageRows.map((m) => m.user_id))];
  const admin = createAdminClient();
  const { data: profiles } = userIds.length
    ? await admin.from('profiles').select('id, name, last_name, avatar').in('id', userIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
  const formatted = await formatMessagesWithReplies(messageRows, profileMap, admin);

  const { data: conv } = await supabase
    .from('conversations')
    .select('type')
    .eq('id', convId)
    .single();

  let membersRead: MemberRead[] = [];
  if (conv?.type === 'group') {
    const { data: members } = await supabase
      .from('conversation_members')
      .select('user_id, last_read_at')
      .eq('conversation_id', convId);
    membersRead = (members ?? []).map((m) => ({
      user_id: m.user_id as string,
      last_read_at: m.last_read_at as string | null,
    }));
    applyGroupReadStatuses(formatted, membersRead, user.id);
  }

  return Response.json({ messages: formatted, members_read: membersRead });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, profile, supabase } = auth;
  const { conversationId } = await params;
  const convId = Number(conversationId);

  if (!(await ensureMember(supabase, convId, user.id))) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  const formData = await request.formData();
  const content = (formData.get('content') as string | null) ?? '';
  const file = formData.get('file') as File | null;
  const voiceDuration = formData.get('voice_duration');
  const albumGroupId = formData.get('album_group_id') as string | null;
  const replyToRaw = formData.get('reply_to_id');

  const insert: Record<string, unknown> = {
    conversation_id: convId,
    user_id: user.id,
    content,
  };

  if (replyToRaw) {
    const replyToId = Number(replyToRaw);
    if (Number.isFinite(replyToId) && replyToId > 0) {
      const { data: replyMsg } = await supabase
        .from('messages')
        .select('id, conversation_id')
        .eq('id', replyToId)
        .maybeSingle();
      if (!replyMsg || replyMsg.conversation_id !== convId) {
        return Response.json({ message: 'Сообщение для ответа не найдено' }, { status: 422 });
      }
      insert.reply_to_id = replyToId;
    }
  }

  if (file && file.size > 0) {
    if (file.size > 15 * 1024 * 1024) {
      return Response.json({ message: 'Файл слишком большой' }, { status: 422 });
    }

    const uploaded = await uploadMessageFile(user.id, file);
    insert.file_path = uploaded.path;
    insert.file_type = uploaded.fileType;
    insert.file_original_name = uploaded.originalName;

    if (albumGroupId && uploaded.fileType === 'image') {
      insert.album_group_id = albumGroupId;
    }

    if (uploaded.fileType === 'voice') {
      const { data: conv } = await supabase
        .from('conversations')
        .select('type, allow_voice_messages')
        .eq('id', convId)
        .single();

      const { data: member } = await supabase
        .from('conversation_members')
        .select('role')
        .eq('conversation_id', convId)
        .eq('user_id', user.id)
        .single();

      if (conv?.type === 'group' && !conv.allow_voice_messages) {
        if (!canManageGroup(member?.role ?? 'member')) {
          return Response.json(
            { message: 'Голосовые сообщения отключены администратором группы' },
            { status: 403 },
          );
        }
      }

      const duration = voiceDuration ? Number(voiceDuration) : 0;
      if (duration < 1) {
        return Response.json({ message: 'Некорректная длительность голосового' }, { status: 422 });
      }
      insert.voice_duration = duration;
    }
  }

  if (!content && !insert.file_path) {
    return Response.json(
      { message: 'Введите текст, прикрепите файл или запишите голосовое' },
      { status: 422 },
    );
  }

  const { data: message, error } = await supabase
    .from('messages')
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', convId);

  const admin = createAdminClient();
  const profileMap = new Map([[profile.id, profile]]);
  const [formatted] = await formatMessagesWithReplies(
    [message as MessageRow],
    profileMap,
    admin,
  );
  void broadcastToConversation(supabase, convId, 'NewMessage', {
    ...formatted,
    conversation_id: convId,
  });

  void notifyConversationPush(
    supabase,
    convId,
    user.id,
    `${profile.name} ${profile.last_name}`.trim(),
    message as MessageRow,
  );

  return Response.json(formatted, { status: 201 });
}
