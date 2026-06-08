import { requireAuth, isOnline } from '@/lib/auth';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const { data: requests } = await supabase
    .from('user_contacts')
    .select('id, user_id')
    .eq('contact_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const senderIds = [...new Set((requests ?? []).map((r) => r.user_id))];
  const { data: senders } = senderIds.length
    ? await supabase.from('profiles').select('id, name, last_name, email, avatar, last_seen_at').in('id', senderIds)
    : { data: [] };
  const senderMap = new Map((senders ?? []).map((s) => [s.id, s]));

  const mapped = (requests ?? []).map((r) => {
    const sender = senderMap.get(r.user_id);
    return {
      id: r.id,
      sender_id: r.user_id,
      name: sender?.name ?? 'Unknown',
      last_name: sender?.last_name ?? '',
      email: sender?.email ?? '',
      avatar: sender?.avatar ?? null,
      is_online: isOnline(sender?.last_seen_at ?? null),
      last_seen_at: sender?.last_seen_at ?? null,
      loading: false,
    };
  });

  return Response.json(mapped);
}
