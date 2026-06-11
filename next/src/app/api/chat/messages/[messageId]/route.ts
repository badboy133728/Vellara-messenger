import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { formatMessage } from '@/lib/chat/formatters';
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

  if (!message || message.user_id !== user.id) {
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
