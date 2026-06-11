import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getVapidPublicKey } from '@/lib/push/config';

export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json({ enabled: false, publicKey: null });
  }
  return NextResponse.json({ enabled: true, publicKey });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const body = await request.json();
  const endpoint = body?.endpoint as string | undefined;
  const p256dh = body?.keys?.p256dh as string | undefined;
  const authKey = body?.keys?.auth as string | undefined;

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ message: 'Некорректная подписка' }, { status: 422 });
  }

  const userAgent = request.headers.get('user-agent');

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth: authKey,
      user_agent: userAgent,
      last_active_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,endpoint' },
  );

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
