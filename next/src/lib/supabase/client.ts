import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv, supabaseEnvErrorMessage } from '@/lib/supabase/env';

let browserClient: SupabaseClient | undefined;
let authListenerAttached = false;

function attachRealtimeAuthListener(client: SupabaseClient) {
  if (authListenerAttached || typeof window === 'undefined') return;
  authListenerAttached = true;

  client.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.access_token) return;
    await client.realtime.setAuth(session.access_token);
  });
}

export function createClient() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(supabaseEnvErrorMessage());
  }
  if (!browserClient) {
    browserClient = createBrowserClient(env.url, env.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    attachRealtimeAuthListener(browserClient);
  }
  return browserClient;
}
