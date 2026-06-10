import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { broadcastToConversation } from '@/lib/realtime/broadcast';
import { createAdminClient } from '@/lib/supabase/admin';

const TYPING_TTL_MS = 6000;

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

  const admin = createAdminClient();
  const { data: members } = await admin
    .from('conversation_members')
    .select('user_id, last_typing_at')
    .eq('conversation_id', convId)
    .neq('user_id', user.id);

  const now = Date.now();
  const typing = (members ?? []).find((m) => {
    if (!m.last_typing_at) return false;
    return now - new Date(m.last_typing_at as string).getTime() < TYPING_TTL_MS;
  });

  return Response.json({
    typing_user_id: typing?.user_id ?? null,
    last_typing_at: typing?.last_typing_at ?? null,
  });
}

export async function POST(
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

  const now = new Date().toISOString();
  const admin = createAdminClient();
  await admin
    .from('conversation_members')
    .update({ last_typing_at: now })
    .eq('conversation_id', convId)
    .eq('user_id', user.id);

  const payload = {
    conversation_id: convId,
    user_id: user.id,
  };

  await broadcastToConversation(supabase, convId, 'UserTyping', payload);

  return Response.json({ ok: true });
}
