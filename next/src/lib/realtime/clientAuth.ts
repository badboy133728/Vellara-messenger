import type { SupabaseClient } from '@supabase/supabase-js';

type SessionPayload = {
  access_token?: string | null;
  refresh_token?: string | null;
};

let connectChain: Promise<boolean> | null = null;

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

async function applyRealtimeAuth(supabase: SupabaseClient): Promise<boolean> {
  const { data: { session: local } } = await supabase.auth.getSession();
  if (local?.access_token) {
    await supabase.realtime.setAuth(local.access_token);
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
  return true;
}

async function waitForRealtimeConnection(
  supabase: SupabaseClient,
  attempts = 60,
): Promise<boolean> {
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

async function runConnect(
  supabase: SupabaseClient,
  forceReconnect: boolean,
): Promise<boolean> {
  try {
    const authed = await applyRealtimeAuth(supabase);
    if (!authed) return false;

    const rt = supabase.realtime;

    if (isRealtimeConnecting(supabase)) {
      return waitForRealtimeConnection(supabase);
    }

    if (rt.isConnected()) {
      if (!forceReconnect) return true;
      rt.disconnect();
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }

    if (isRealtimeConnecting(supabase)) {
      return waitForRealtimeConnection(supabase);
    }

    if (!rt.isConnected()) {
      rt.connect();
    }

    return waitForRealtimeConnection(supabase);
  } catch {
    return false;
  }
}

function enqueueConnect(
  supabase: SupabaseClient,
  forceReconnect: boolean,
): Promise<boolean> {
  const task = () => runConnect(supabase, forceReconnect);
  const next = connectChain ? connectChain.then(task, task) : task();
  connectChain = next;
  return next.finally(() => {
    if (connectChain === next) connectChain = null;
  });
}

/** Sync JWT and ensure socket is up — never tears down an active/connecting socket. */
export async function syncSupabaseRealtimeAuth(supabase: SupabaseClient): Promise<boolean> {
  return enqueueConnect(supabase, false);
}

/** Ensure Realtime is connected (soft boot). */
export async function ensureRealtimeConnected(supabase: SupabaseClient): Promise<boolean> {
  return enqueueConnect(supabase, false);
}

/** Hard reconnect — only after offline / repeated channel errors. */
export async function reconnectSupabaseRealtime(supabase: SupabaseClient): Promise<boolean> {
  return enqueueConnect(supabase, true);
}
