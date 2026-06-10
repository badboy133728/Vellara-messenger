import { randomUUID } from 'crypto';
import { ensureMember } from '@/lib/chat/conversations';
import { unhideConversationForRecipients } from '@/lib/chat/unhideMembers';
import { formatMessagesWithReplies } from '@/lib/chat/messageList';
import { canManageGroup } from '@/lib/chat/permissions';
import { broadcastToConversation } from '@/lib/realtime/broadcast';
import { notifyConversationPush } from '@/lib/push/notify';
import { isE2EContent } from '@/lib/crypto/message';
import { copyMessageFile } from '@/lib/storage-server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FormattedMessage, MessageRow, Profile } from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';

async function collectMessagesToForward(
  admin: SupabaseClient,
  source: MessageRow,
): Promise<MessageRow[]> {
  if (source.album_group_id && source.file_type === 'image') {
    const { data } = await admin
      .from('messages')
      .select('*')
      .eq('conversation_id', source.conversation_id)
      .eq('album_group_id', source.album_group_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (data?.length) return data as MessageRow[];
  }
  return [source];
}

async function canSendVoiceToConversation(
  supabase: SupabaseClient,
  convId: number,
  userId: string,
): Promise<boolean> {
  const { data: conv } = await supabase
    .from('conversations')
    .select('type, allow_voice_messages')
    .eq('id', convId)
    .single();

  if (conv?.type !== 'group' || conv.allow_voice_messages !== false) return true;

  const { data: member } = await supabase
    .from('conversation_members')
    .select('role')
    .eq('conversation_id', convId)
    .eq('user_id', userId)
    .single();

  return canManageGroup(member?.role ?? 'member');
}

export async function forwardMessageToConversations(
  supabase: SupabaseClient,
  user: { id: string },
  profile: Profile,
  sourceMessageId: number,
  conversationIds: number[],
  caption?: string,
): Promise<FormattedMessage[]> {
  const admin = createAdminClient();
  const { data: sourceRow } = await admin
    .from('messages')
    .select('*')
    .eq('id', sourceMessageId)
    .maybeSingle();

  if (!sourceRow) {
    throw new Error('NOT_FOUND');
  }

  const source = sourceRow as MessageRow;

  if (!(await ensureMember(supabase, source.conversation_id, user.id))) {
    throw new Error('FORBIDDEN');
  }

  if (source.message_type === 'system' || source.deleted_at) {
    throw new Error('INVALID');
  }

  const targets = [...new Set(conversationIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (!targets.length) {
    throw new Error('NO_TARGETS');
  }

  for (const convId of targets) {
    if (!(await ensureMember(supabase, convId, user.id))) {
      throw new Error('FORBIDDEN_TARGET');
    }
  }

  const sources = await collectMessagesToForward(admin, source);
  const hasVoice = sources.some((m) => m.file_type === 'voice');
  if (hasVoice) {
    for (const convId of targets) {
      if (!(await canSendVoiceToConversation(supabase, convId, user.id))) {
        throw new Error('VOICE_BLOCKED');
      }
    }
  }

  const { data: originalSender } = await admin
    .from('profiles')
    .select('id, name, last_name, avatar')
    .eq('id', source.user_id)
    .maybeSingle();

  const forwardedFromSenderName =
    `${originalSender?.name ?? ''} ${originalSender?.last_name ?? ''}`.trim() || 'Контакт';

  const created: MessageRow[] = [];
  const trimmedCaption = caption?.trim() ?? '';

  for (const targetConvId of targets) {
    let albumGroupId: string | null = null;
    const isMultiImageAlbum =
      sources.length > 1 && sources.every((m) => m.file_type === 'image' && m.album_group_id);

    if (isMultiImageAlbum) {
      albumGroupId = randomUUID();
    }

    for (let i = 0; i < sources.length; i++) {
      const src = sources[i]!;
      let messageContent = src.content ?? '';
      if (i === 0 && trimmedCaption && messageContent && !isE2EContent(messageContent)) {
        messageContent = `${trimmedCaption}\n\n${messageContent}`;
      }
      // E2E: подпись добавляется на клиенте при перешифровке; в БД остаётся исходный ciphertext.

      const insert: Record<string, unknown> = {
        conversation_id: targetConvId,
        user_id: user.id,
        content: messageContent,
        forwarded_from_id: src.id,
        forwarded_from_conversation_id: src.conversation_id,
        forwarded_from_sender_name: forwardedFromSenderName,
      };

      if (src.file_path) {
        insert.file_path = await copyMessageFile(
          src.file_path,
          user.id,
          src.file_original_name ?? 'file',
        );
        insert.file_type = src.file_type;
        insert.file_original_name = src.file_original_name;

        if (src.file_type === 'voice') {
          insert.voice_duration = src.voice_duration;
        }

        if (src.file_type === 'image' && albumGroupId) {
          insert.album_group_id = albumGroupId;
        }
      }

      if (!insert.content && !insert.file_path) {
        continue;
      }

      const { data: message, error } = await supabase
        .from('messages')
        .insert(insert)
        .select('*')
        .single();

      if (error || !message) {
        throw new Error(error?.message ?? 'INSERT_FAILED');
      }

      created.push(message as MessageRow);
    }

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', targetConvId);

    await unhideConversationForRecipients(supabase, targetConvId, user.id);
  }

  const profileMap = new Map<string, Profile>([[profile.id, profile]]);
  const userIds = [...new Set(created.map((m) => m.user_id))];
  if (userIds.length) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, name, last_name, avatar, email, theme, profile_visibility, bio, background, background_gradient, last_seen_at, created_at, updated_at')
      .in('id', userIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, p as Profile);
    }
  }

  const formatted = await formatMessagesWithReplies(created, profileMap, admin);

  await Promise.all(
    formatted.map(async (msg) => {
      const convId = created.find((c) => c.id === msg.id)?.conversation_id;
      if (!convId) return;
      const row = created.find((c) => c.id === msg.id)!;
      await broadcastToConversation(supabase, convId, 'NewMessage', {
        ...msg,
        conversation_id: convId,
      });
      void notifyConversationPush(
        supabase,
        convId,
        user.id,
        `${profile.name} ${profile.last_name}`.trim(),
        row,
      );
    }),
  );

  return formatted.map((msg) => {
    const convId = created.find((c) => c.id === msg.id)?.conversation_id;
    return { ...msg, conversation_id: convId };
  });
}

export async function forwardMessagesToConversations(
  supabase: SupabaseClient,
  user: { id: string },
  profile: Profile,
  sourceMessageIds: number[],
  conversationIds: number[],
  caption?: string,
): Promise<FormattedMessage[]> {
  const uniqueOrdered: number[] = [];
  const seen = new Set<number>();
  for (const id of sourceMessageIds) {
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    uniqueOrdered.push(id);
  }
  if (!uniqueOrdered.length) {
    throw new Error('NO_SOURCES');
  }

  const all: FormattedMessage[] = [];
  for (let i = 0; i < uniqueOrdered.length; i++) {
    const batch = await forwardMessageToConversations(
      supabase,
      user,
      profile,
      uniqueOrdered[i]!,
      conversationIds,
      i === 0 ? caption : undefined,
    );
    all.push(...batch);
  }
  return all;
}
