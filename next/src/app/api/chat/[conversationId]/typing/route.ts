import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { broadcastToConversation } from '@/lib/realtime/broadcast';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const payload = {
    conversation_id: convId,
    user_id: user.id,
  };

  await broadcastToConversation(supabase, convId, 'UserTyping', payload);
  await wait(450);
  void broadcastToConversation(supabase, convId, 'UserTyping', payload);

  return Response.json({ ok: true });
}
