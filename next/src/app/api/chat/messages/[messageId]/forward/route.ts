import { requireAuth } from '@/lib/auth';
import { forwardMessageToConversations } from '@/lib/chat/forwardMessage';

export const maxDuration = 60;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, profile, supabase } = auth;
  const messageId = Number((await params).messageId);

  if (!Number.isFinite(messageId) || messageId <= 0) {
    return Response.json({ message: 'Некорректный id сообщения' }, { status: 422 });
  }

  let body: { conversation_ids?: number[]; caption?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: 'Некорректное тело запроса' }, { status: 422 });
  }

  const conversationIds = Array.isArray(body.conversation_ids) ? body.conversation_ids : [];
  const caption = typeof body.caption === 'string' ? body.caption : undefined;

  try {
    const messages = await forwardMessageToConversations(
      supabase,
      user,
      profile,
      messageId,
      conversationIds,
      caption,
    );
    return Response.json({ messages });
  } catch (err) {
    const code = err instanceof Error ? err.message : 'UNKNOWN';
    if (code === 'NOT_FOUND') {
      return Response.json({ message: 'Сообщение не найдено' }, { status: 404 });
    }
    if (code === 'FORBIDDEN' || code === 'FORBIDDEN_TARGET') {
      return Response.json({ message: 'Нет доступа к чату' }, { status: 403 });
    }
    if (code === 'INVALID') {
      return Response.json({ message: 'Это сообщение нельзя переслать' }, { status: 422 });
    }
    if (code === 'NO_TARGETS') {
      return Response.json({ message: 'Выберите чат для пересылки' }, { status: 422 });
    }
    if (code === 'VOICE_BLOCKED') {
      return Response.json(
        { message: 'Голосовые сообщения запрещены в одной из выбранных групп' },
        { status: 403 },
      );
    }
    return Response.json(
      { message: err instanceof Error ? err.message : 'Не удалось переслать' },
      { status: 500 },
    );
  }
}
