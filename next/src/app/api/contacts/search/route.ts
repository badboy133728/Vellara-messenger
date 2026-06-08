import { requireAuth } from '@/lib/auth';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const query = (new URL(request.url).searchParams.get('query') ?? '').trim();
  if (query.length < 2) return Response.json([]);

  const { data: excluded } = await supabase
    .from('user_contacts')
    .select('contact_id')
    .eq('user_id', user.id)
    .in('status', ['accepted', 'pending']);

  const excludeIds = new Set([user.id, ...(excluded ?? []).map((e) => e.contact_id)]);

  const { data: users } = await supabase
    .from('profiles')
    .select('id, name, last_name, email, avatar')
    .or(`name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(10);

  return Response.json((users ?? []).filter((u) => !excludeIds.has(u.id)));
}
