import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { isOnline, touchLastSeen } from '@/lib/presence';

export async function POST() {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  await touchLastSeen(supabase, user.id);

  return NextResponse.json({
    ok: true,
    last_seen_at: new Date().toISOString(),
    is_online: true,
  });
}

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { profile } = auth;

  return NextResponse.json({
    last_seen_at: profile.last_seen_at,
    is_online: isOnline(profile.last_seen_at),
  });
}
