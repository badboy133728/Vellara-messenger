import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { id } = await params;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('identity_public_key')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({
    public_key: (data as { identity_public_key?: string | null } | null)?.identity_public_key ?? null,
  });
}
