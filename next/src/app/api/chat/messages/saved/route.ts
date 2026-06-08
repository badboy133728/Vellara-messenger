import { requireAuth } from '@/lib/auth';
import { formatMessage } from '@/lib/chat/formatters';
import type { MessageRow, Profile } from '@/lib/types';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const perPage = Math.min(50, Math.max(10, Number(new URL(request.url).searchParams.get('per_page') ?? 30)));

  const { data: saved } = await supabase
    .from('saved_messages')
    .select('created_at, message_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(perPage);

  const messageIds = (saved ?? []).map((s) => s.message_id);
  if (messageIds.length === 0) {
    return Response.json({ data: [], meta: { current_page: 1, last_page: 1, per_page: perPage, total: 0 } });
  }

  const { data: messages } = await supabase.from('messages').select('*').in('id', messageIds);
  const userIds = [...new Set((messages ?? []).map((m) => m.user_id))];
  const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));

  const convIds = [...new Set((messages ?? []).map((m) => m.conversation_id))];
  const { data: convs } = await supabase.from('conversations').select('id, type, title').in('id', convIds);
  const convMap = new Map((convs ?? []).map((c) => [c.id, c]));

  const items = (saved ?? []).map((s) => {
    const msg = (messages ?? []).find((m) => m.id === s.message_id);
    if (!msg) return null;
    const conv = convMap.get(msg.conversation_id);
    return {
      saved_at: s.created_at,
      message: formatMessage(msg as MessageRow, profileMap.get(msg.user_id) ?? null),
      source: {
        conversation_id: conv?.id,
        conversation_type: conv?.type ?? 'private',
        conversation_title: conv?.title,
      },
    };
  }).filter(Boolean);

  return Response.json({
    data: items,
    meta: { current_page: 1, last_page: 1, per_page: perPage, total: items.length },
  });
}
