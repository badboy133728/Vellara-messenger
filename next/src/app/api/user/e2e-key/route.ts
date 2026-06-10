import { requireAuth } from '@/lib/auth';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { profile } = auth;
  return Response.json({
    public_key: (profile as { identity_public_key?: string | null }).identity_public_key ?? null,
  });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const body = (await request.json().catch(() => ({}))) as { public_key?: string };
  const publicKey = body.public_key?.trim();
  if (!publicKey || publicKey.length > 4096) {
    return Response.json({ message: 'Некорректный публичный ключ' }, { status: 422 });
  }

  const { error } = await supabase
    .from('profiles')
    .update({ identity_public_key: publicKey })
    .eq('id', user.id);

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
