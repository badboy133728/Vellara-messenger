import { requireAuth } from '@/lib/auth';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const { data } = await supabase
    .from('saved_messages')
    .select('message_id')
    .eq('user_id', user.id);

  return Response.json({ ids: (data ?? []).map((r) => r.message_id) });
}
