import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { formatMessage } from '@/lib/chat/formatters';
import { canManageChannel, canManageGroup } from '@/lib/chat/permissions';
import type { MessageRow } from '@/lib/types';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, profile, supabase } = auth;
  const { messageId } = await params;
  const id = Number(messageId);

  const body = await request.json();
  const content = (body.content ?? '').trim();
  if (!content || content.length > 2000) {
    return Response.json({ message: 'Некорректный текст' }, { status: 422 });
  }

  const { data: message } = await supabase
    .from('messages')
    .select('*')
    .eq('id', id)
    .single();

  if (!message) {
    return Response.json({ message: 'Сообщение не найдено' }, { status: 404 });
  }

  if (!(await ensureMember(supabase, message.conversation_id, user.id))) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  let canDelete = message.user_id === user.id;
  if (!canDelete) {
    const [{ data: conv }, { data: actor }] = await Promise.all([
      supabase.from('conversations').select('type').eq('id', message.conversation_id).single(),
      supabase
        .from('conversation_members')
        .select('role')
        .eq('conversation_id', message.conversation_id)
        .eq('user_id', user.id)
        .single(),
    ]);
    const role = actor?.role ?? 'member';
    if (conv?.type === 'group' && canManageGroup(role)) {
      canDelete = true;
    }
    if (conv?.type === 'channel' && canManageChannel(role) && !!message.reply_to_id) {
      canDelete = true;
    }
  }

  if (!canDelete) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  if (!(await ensureMember(supabase, message.conversation_id, user.id))) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const { data: updated } = await supabase
    .from('messages')
    .update({ content, is_edited: true, edited_at: now })
    .eq('id', id)
    .select('*')
    .single();

  return Response.json(formatMessage(updated as MessageRow, profile));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, profile, supabase } = auth;
  const { messageId } = await params;
  const id = Number(messageId);

  const { data: message } = await supabase
    .from('messages')
    .select('*')
    .eq('id', id)
    .single();

  if (!message || message.user_id !== user.id) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const { data: updated } = await supabase
    .from('messages')
    .update({ deleted_at: now, content: '' })
    .eq('id', id)
    .select('*')
    .single();

  return Response.json(formatMessage(updated as MessageRow, profile, true));
}
