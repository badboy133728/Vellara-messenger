import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const body = await request.json().catch(() => ({}));
  const endpoint = body?.endpoint as string | undefined;

  let query = supabase.from('push_subscriptions').delete().eq('user_id', user.id);
  if (endpoint) {
    query = query.eq('endpoint', endpoint);
  }

  const { error } = await query;
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
