import { POST as markRead } from '../messages/read/route';

export async function POST(
  request: Request,
  ctx: { params: Promise<{ conversationId: string }> },
) {
  return markRead(request, ctx);
}
