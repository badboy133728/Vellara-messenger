import { requireAuth } from '@/lib/auth';

type ProfileE2E = {
  identity_public_key?: string | null;
  identity_key_backup?: string | null;
};

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { profile } = auth;
  const row = profile as ProfileE2E;
  return Response.json({
    public_key: row.identity_public_key ?? null,
    has_backup: Boolean(row.identity_key_backup),
    key_backup: row.identity_key_backup ?? null,
  });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const body = (await request.json().catch(() => ({}))) as {
    public_key?: string;
    key_backup?: string;
    restore?: boolean;
  };

  const { data: current } = await supabase
    .from('profiles')
    .select('identity_public_key, identity_key_backup')
    .eq('id', user.id)
    .single();

  const existing = (current as ProfileE2E | null)?.identity_public_key ?? null;
  const patch: Record<string, string> = {};

  const publicKey = body.public_key?.trim();
  if (publicKey) {
    if (publicKey.length > 4096) {
      return Response.json({ message: 'Некорректный публичный ключ' }, { status: 422 });
    }
    if (existing && existing !== publicKey && !body.restore) {
      return Response.json(
        {
          message:
            'Ключ шифрования уже зарегистрирован на другом устройстве. Введите код восстановления.',
        },
        { status: 409 },
      );
    }
    patch.identity_public_key = publicKey;
  }

  const keyBackup = body.key_backup?.trim();
  if (keyBackup) {
    if (keyBackup.length > 16384) {
      return Response.json({ message: 'Некорректная резервная копия' }, { status: 422 });
    }
    patch.identity_key_backup = keyBackup;
  }

  if (!Object.keys(patch).length) {
    return Response.json({ message: 'Нет данных для сохранения' }, { status: 422 });
  }

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);

  if (error) {
    const hint = error.message.includes('identity_')
      ? ' Выполните миграции 015 и 016 в Supabase.'
      : '';
    return Response.json({ message: error.message + hint }, { status: 500 });
  }

  return Response.json({ ok: true });
}
