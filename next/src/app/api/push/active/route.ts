import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

/** Помечает push-подписку как активную (вкладка открыта) — сервер не шлёт push на это устройство. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const body = await request.json().catch(() => ({}));
  const endpoint = body?.endpoint as string | undefined;
  if (!endpoint) {
    return NextResponse.json({ message: 'endpoint required' }, { status: 422 });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
