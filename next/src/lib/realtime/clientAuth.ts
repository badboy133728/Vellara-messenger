import type { SupabaseClient } from '@supabase/supabase-js';

/** Sync Realtime JWT from server session (httpOnly Supabase cookies). */
export async function syncSupabaseRealtimeAuth(supabase: SupabaseClient): Promise<boolean> {
  try {
    const res = await fetch('/api/realtime/session', { credentials: 'include' });
    if (!res.ok) return false;
    const data = (await res.json()) as { access_token?: string | null };
    if (!data.access_token) return false;
    await supabase.realtime.setAuth(data.access_token);
    return true;
  } catch {
    return false;
  }
}
