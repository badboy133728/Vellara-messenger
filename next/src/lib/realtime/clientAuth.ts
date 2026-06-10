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

async function fetchServerRealtimeSession(): Promise<SessionPayload | null> {
  const res = await fetch('/api/realtime/session', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as SessionPayload;
}

/** Sync Realtime JWT from browser session or httpOnly cookies. */
export async function syncSupabaseRealtimeAuth(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data: { session: local } } = await supabase.auth.getSession();
    if (local?.access_token) {
      await supabase.realtime.setAuth(local.access_token);
      if (!supabase.realtime.isConnected() && !isRealtimeConnecting(supabase)) {
        supabase.realtime.connect();
      }
      return true;
    }

    const data = await fetchServerRealtimeSession();
    if (!data?.access_token) return false;

    if (data.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (error) {
        await supabase.realtime.setAuth(data.access_token);
      }
    } else {
      await supabase.realtime.setAuth(data.access_token);
    }

    if (!supabase.realtime.isConnected() && !isRealtimeConnecting(supabase)) {
      supabase.realtime.connect();
    }
    return true;
  } catch {
    return false;
  }
}

async function waitForRealtimeConnection(supabase: SupabaseClient, attempts = 50): Promise<boolean> {
  const rt = supabase.realtime;
  for (let i = 0; i < attempts; i++) {
    if (rt.isConnected()) return true;
    if (isRealtimeConnecting(supabase)) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      continue;
    }
    break;
  }
  return rt.isConnected();
}

/** Hard reconnect Realtime socket (mobile WebView often drops auth silently). */
export async function reconnectSupabaseRealtime(supabase: SupabaseClient): Promise<boolean> {
  const ok = await syncSupabaseRealtimeAuth(supabase);
  if (!ok) return false;

  try {
    const rt = supabase.realtime;

    if (isRealtimeConnecting(supabase)) {
      return waitForRealtimeConnection(supabase);
    }

    if (rt.isConnected()) {
      rt.disconnect();
      await new Promise((resolve) => window.setTimeout(resolve, 64));
    }

    if (!rt.isConnected() && !isRealtimeConnecting(supabase)) {
      rt.connect();
    }

    return waitForRealtimeConnection(supabase);
  } catch {
    return false;
  }
}
