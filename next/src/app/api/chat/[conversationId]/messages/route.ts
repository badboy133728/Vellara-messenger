import { requireAuth } from '@/lib/auth';
import { assertCanPostToConversation } from '@/lib/chat/channelAccess';
import { ensureMember } from '@/lib/chat/conversations';
import { formatMessagesWithReplies } from '@/lib/chat/messageList';
import { canManageGroup } from '@/lib/chat/permissions';
import { publishConversationMessage, publishUserMessage } from '@/lib/realtime/publish';
import { notifyConversationPush } from '@/lib/push/notify';
import {
  applyMessageAttachment,
  getMessageAttachmentFromForm,
} from '@/lib/chat/messageAttachment';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MessageRow, Profile } from '@/lib/types';
import { unhideConversationForRecipients } from '@/lib/chat/unhideMembers';
import { applyGroupReadStatuses, type MemberRead } from '@/utils/groupReadStatus';

export const maxDuration = 60;

export async function GET(
  request: Request,
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

  const { searchParams } = new URL(request.url);
  const beforeIdRaw = searchParams.get('before_id');
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit')) || 50));

  let query = supabase.from('messages').select('*').eq('conversation_id', convId);

  if (beforeIdRaw) {
    const beforeId = Number(beforeIdRaw);
    if (Number.isFinite(beforeId) && beforeId > 0) {
      const { data: pivot } = await supabase
        .from('messages')
        .select('created_at')
        .eq('id', beforeId)
        .eq('conversation_id', convId)
        .maybeSingle();
      if (pivot?.created_at) {
        query = query.lt('created_at', pivot.created_at as string);
      }
    }
  }

  const { data: recent } = await query.order('created_at', { ascending: false }).limit(limit);

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
  if (conv?.type === 'group' || conv?.type === 'channel') {
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

  return Response.json({
    messages: formatted,
    members_read: membersRead,
    has_more: (recent ?? []).length === limit,
  });
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
  const attachment = getMessageAttachmentFromForm(formData);
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

  if (attachment) {
    let fileType: string;
    try {
      ({ fileType } = await applyMessageAttachment(insert, attachment, user.id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Не удалось загрузить файл';
      return Response.json(
        {
          message:
            msg.includes('Payload') || msg.includes('413')
              ? 'Файл слишком большой для отправки'
              : msg,
        },
        { status: 422 },
      );
    }

    if (albumGroupId && fileType === 'image') {
      insert.album_group_id = albumGroupId;
    }

    if (fileType === 'voice') {
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

  const channelError = await assertCanPostToConversation(
    supabase,
    convId,
    user.id,
    insert.reply_to_id as number | undefined,
  );
  if (channelError) {
    return Response.json({ message: channelError }, { status: 403 });
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

  await unhideConversationForRecipients(supabase, convId, user.id);

  const admin = createAdminClient();
  const profileMap = new Map([[profile.id, profile]]);
  const [formatted] = await formatMessagesWithReplies(
    [message as MessageRow],
    profileMap,
    admin,
  );
  await publishConversationMessage({
    ...formatted,
    conversation_id: convId,
  });

  // Ensure recipients see brand-new dialogs instantly even before they subscribe
  // to the conversation:* channel.
  const { data: members } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', convId);
  const recipients = (members ?? [])
    .map((m) => m.user_id as string)
    .filter((id) => id !== user.id);
  await Promise.all(
    recipients.map((recipientId) =>
      publishUserMessage(recipientId, {
        ...formatted,
        conversation_id: convId,
      }),
    ),
  );

  void notifyConversationPush(
    supabase,
    convId,
    user.id,
    `${profile.name} ${profile.last_name}`.trim(),
    message as MessageRow,
  );

  return Response.json(formatted, { status: 201 });
}
