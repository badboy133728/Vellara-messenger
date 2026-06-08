import type { SupabaseClient } from '@supabase/supabase-js';

type SessionPayload = {
  access_token?: string | null;
  refresh_token?: string | null;
};

/** Sync Realtime JWT from server session (httpOnly Supabase cookies). */
export async function syncSupabaseRealtimeAuth(supabase: SupabaseClient): Promise<boolean> {
  try {
    const res = await fetch('/api/realtime/session', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const data = (await res.json()) as SessionPayload;
    if (!data.access_token) return false;

    if (data.refresh_token) {
      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
    }

    await supabase.realtime.setAuth(data.access_token);
    return true;
  } catch {
    return false;
  }
}

/** Hard reconnect Realtime socket (mobile WebView often drops auth silently). */
export async function reconnectSupabaseRealtime(supabase: SupabaseClient): Promise<boolean> {
  const ok = await syncSupabaseRealtimeAuth(supabase);
  if (!ok) return false;
  try {
    supabase.realtime.disconnect();
    supabase.realtime.connect();
  } catch {
    /* ignore */
  }
  return true;
}
