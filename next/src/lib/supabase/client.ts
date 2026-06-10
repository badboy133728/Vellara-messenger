import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv, supabaseEnvErrorMessage } from '@/lib/supabase/env';
import { syncSupabaseRealtimeAuth } from '@/lib/realtime/clientAuth';

let browserClient: SupabaseClient | undefined;
let realtimeBootstrapped = false;

function attachRealtimeAuthListener(client: SupabaseClient) {
  if (realtimeBootstrapped || typeof window === 'undefined') return;
  realtimeBootstrapped = true;

  void syncSupabaseRealtimeAuth(client);

  client.auth.onAuthStateChange(async (event, session) => {
    if (!session?.access_token) return;
    await client.realtime.setAuth(session.access_token);
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (!client.realtime.isConnected()) {
        client.realtime.connect();
      }
    }
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
