import { createClient } from '@/lib/supabase/server';

/** Отдаёт access_token для supabase.realtime.setAuth() на клиенте (httpOnly cookies). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return Response.json({ access_token: null }, { status: 401 });
  }

  return Response.json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  });
}
