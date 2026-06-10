import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { formatMessagesWithReplies } from '@/lib/chat/messageList';
import { isValidUserMessagePath } from '@/lib/chat/messageAttachment';
import { broadcastToConversation } from '@/lib/realtime/broadcast';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MessageRow, Profile } from '@/lib/types';

type FinalizeUpdate = {
  message_id: number;
  content: string;
  file_original_name?: string;
  file_path?: string;
};

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, profile, supabase } = auth;

  const body = (await request.json().catch(() => ({}))) as {
    updates?: FinalizeUpdate[];
  };
  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (!updates.length) {
    return Response.json({ messages: [] });
  }

  const admin = createAdminClient();
  const updatedRows: MessageRow[] = [];

  for (const item of updates) {
    const id = Number(item.message_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (typeof item.content !== 'string') continue;

    const { data: message } = await supabase
      .from('messages')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!message || message.user_id !== user.id) {
      return Response.json({ message: 'Нет доступа к сообщению' }, { status: 403 });
    }
    if (!message.forwarded_from_id) {
      return Response.json({ message: 'Можно обновить только пересланные сообщения' }, { status: 422 });
    }
    if (!(await ensureMember(supabase, message.conversation_id, user.id))) {
      return Response.json({ message: 'Нет доступа к чату' }, { status: 403 });
    }

    const patch: Record<string, unknown> = { content: item.content };
    if (item.file_original_name) {
      patch.file_original_name = item.file_original_name;
    }
    if (item.file_path) {
      if (!isValidUserMessagePath(item.file_path, user.id)) {
        return Response.json({ message: 'Некорректный путь к файлу' }, { status: 422 });
      }
      patch.file_path = item.file_path;
    }

    const { data: updated, error } = await supabase
      .from('messages')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !updated) {
      return Response.json({ message: error?.message ?? 'Не удалось обновить' }, { status: 500 });
    }

    updatedRows.push(updated as MessageRow);
  }

  const profileMap = new Map<string, Profile>([[profile.id, profile]]);
  const formatted = await formatMessagesWithReplies(updatedRows, profileMap, admin);

  for (const msg of formatted) {
    const row = updatedRows.find((r) => r.id === msg.id);
    if (!row) continue;
    broadcastToConversation(supabase, row.conversation_id, 'NewMessage', {
      ...msg,
      conversation_id: row.conversation_id,
    });
  }

  return Response.json({
    messages: formatted.map((msg) => {
      const row = updatedRows.find((r) => r.id === msg.id);
      return { ...msg, conversation_id: row?.conversation_id };
    }),
  });
}
