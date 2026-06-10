import type { SupabaseClient } from '@supabase/supabase-js';

type SessionPayload = {
  access_token?: string | null;
  refresh_token?: string | null;
};

function realtimeSocket(supabase: SupabaseClient): WebSocket | null {
  const conn = (supabase.realtime as unknown as { conn?: WebSocket | null }).conn;
  return conn ?? null;
}

function isRealtimeConnecting(supabase: SupabaseClient): boolean {
  const socket = realtimeSocket(supabase);
  return socket?.readyState === WebSocket.CONNECTING;
}

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
    const rt = supabase.realtime;

    if (isRealtimeConnecting(supabase)) {
      return true;
    }

    if (rt.isConnected()) {
      rt.disconnect();
      await new Promise((resolve) => window.setTimeout(resolve, 32));
    }

    if (!rt.isConnected() && !isRealtimeConnecting(supabase)) {
      rt.connect();
    }
  } catch {
    /* ignore */
  }

  return true;
}
