import { requireAuth } from '@/lib/auth';
import { formatMessage } from '@/lib/chat/formatters';
import { formatMessagesWithReplies } from '@/lib/chat/messageList';
import { getOrCreateSavedConversation } from '@/lib/chat/savedConversation';
import { publishConversationMessage } from '@/lib/realtime/publish';
import { applyMessageAttachment } from '@/lib/chat/messageAttachment';
type UploadedPreparedFile = {
  mode: 'uploaded';
  path: string;
  fileType: string;
  originalName: string;
};
import { createAdminClient } from '@/lib/supabase/admin';
import type { MessageRow, Profile } from '@/lib/types';

type SavedFeedItem = {
  saved_at: string;
  is_own_note: boolean;
  message: ReturnType<typeof formatMessage>;
  source: {
    conversation_id: number;
    conversation_type: string;
    conversation_title: string | null;
  };
};

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const perPage = Math.min(50, Math.max(10, Number(new URL(request.url).searchParams.get('per_page') ?? 40)));
  const savedConvId = await getOrCreateSavedConversation(supabase, user.id);

  const [{ data: saved }, { data: ownMessages }] = await Promise.all([
    supabase
      .from('saved_messages')
      .select('created_at, message_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(perPage),
    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', savedConvId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(perPage),
  ]);

  const bookmarkedIds = new Set((saved ?? []).map((s) => s.message_id as number));
  const allMessageIds = [
    ...bookmarkedIds,
    ...(ownMessages ?? [])
      .map((m) => m.id as number)
      .filter((id) => !bookmarkedIds.has(id)),
  ];

  if (!allMessageIds.length) {
    return Response.json({
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: perPage, total: 0 },
    });
  }

  const { data: messages } = await supabase.from('messages').select('*').in('id', [...new Set(allMessageIds)]);
  const userIds = [...new Set((messages ?? []).map((m) => m.user_id))];
  const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));

  const convIds = [...new Set((messages ?? []).map((m) => m.conversation_id))];
  const { data: convs } = await supabase.from('conversations').select('id, type, title').in('id', convIds);
  const convMap = new Map((convs ?? []).map((c) => [c.id, c]));

  const items: SavedFeedItem[] = [];

  for (const s of saved ?? []) {
    const msg = (messages ?? []).find((m) => m.id === s.message_id);
    if (!msg) continue;
    const conv = convMap.get(msg.conversation_id);
    items.push({
      saved_at: s.created_at as string,
      is_own_note: conv?.type === 'saved',
      message: formatMessage(msg as MessageRow, profileMap.get(msg.user_id) ?? null),
      source: {
        conversation_id: conv?.id ?? msg.conversation_id,
        conversation_type: conv?.type ?? 'private',
        conversation_title: conv?.title ?? null,
      },
    });
  }

  for (const msg of ownMessages ?? []) {
    if (bookmarkedIds.has(msg.id as number)) continue;
    const conv = convMap.get(msg.conversation_id);
    items.push({
      saved_at: msg.created_at as string,
      is_own_note: true,
      message: formatMessage(msg as MessageRow, profileMap.get(msg.user_id) ?? null),
      source: {
        conversation_id: conv?.id ?? savedConvId,
        conversation_type: 'saved',
        conversation_title: conv?.title ?? 'Избранное',
      },
    });
  }

  items.sort((a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime());

  return Response.json({
    data: items.slice(0, perPage),
    meta: { current_page: 1, last_page: 1, per_page: perPage, total: items.length },
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, profile, supabase } = auth;

  const convId = await getOrCreateSavedConversation(supabase, user.id);
  const formData = await request.formData();
  const content = ((formData.get('content') as string | null) ?? '').trim();
  const inlineFiles = formData
    .getAll('file')
    .filter((f): f is File => f instanceof File && f.size > 0);
  const uploadedMetaRaw = formData.get('uploaded_files') as string | null;
  let uploadedMeta: UploadedPreparedFile[] = [];
  if (uploadedMetaRaw) {
    try {
      const parsed = JSON.parse(uploadedMetaRaw) as UploadedPreparedFile[];
      uploadedMeta = parsed.filter(
        (item) =>
          item?.mode === 'uploaded' &&
          typeof item.path === 'string' &&
          typeof item.fileType === 'string',
      );
    } catch {
      return Response.json({ message: 'Некорректные данные вложений' }, { status: 422 });
    }
  }

  const attachmentCount = inlineFiles.length + uploadedMeta.length;
  if (!content && !attachmentCount) {
    return Response.json({ message: 'Введите текст или прикрепите файл' }, { status: 422 });
  }

  const albumGroupId =
    attachmentCount > 1 &&
    inlineFiles.every(
      (f) =>
        f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name),
    ) &&
    uploadedMeta.every((item) => item.fileType === 'image')
      ? crypto.randomUUID()
      : null;

  const created: MessageRow[] = [];

  const postOne = async (
    attachment:
      | { kind: 'file'; file: File }
      | { kind: 'uploaded'; path: string; fileType: string; originalName: string }
      | null,
    index: number,
  ) => {
    const insert: Record<string, unknown> = {
      conversation_id: convId,
      user_id: user.id,
      content: index === 0 ? content : '',
    };

    if (attachment) {
      const { fileType } = await applyMessageAttachment(insert, attachment, user.id);
      if (albumGroupId && fileType === 'image') {
        insert.album_group_id = albumGroupId;
      }
    }

    const { data: message, error } = await supabase
      .from('messages')
      .insert(insert)
      .select('*')
      .single();

    if (error || !message) {
      throw new Error(error?.message ?? 'Не удалось сохранить');
    }
    created.push(message as MessageRow);
  };

  try {
    if (!attachmentCount) {
      await postOne(null, 0);
    } else {
      const attachments = [
        ...inlineFiles.map((file) => ({ kind: 'file' as const, file })),
        ...uploadedMeta.map((item) => ({
          kind: 'uploaded' as const,
          path: item.path,
          fileType: item.fileType,
          originalName: item.originalName,
        })),
      ];
      for (let i = 0; i < attachments.length; i++) {
        await postOne(attachments[i]!, i);
      }
    }
  } catch (err) {
    return Response.json(
      { message: err instanceof Error ? err.message : 'Не удалось сохранить' },
      { status: 422 },
    );
  }

  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', convId);

  const admin = createAdminClient();
  const profileMap = new Map([[profile.id, profile]]);
  const formatted = await formatMessagesWithReplies(created, profileMap, admin);

  await Promise.all(
    formatted.map((msg) =>
      publishConversationMessage({
        ...msg,
        conversation_id: convId,
      }),
    ),
  );

  return Response.json(
    {
      messages: formatted,
      is_own_note: true,
    },
    { status: 201 },
  );
}
