import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv, supabaseEnvErrorMessage } from '@/lib/supabase/env';

let browserClient: SupabaseClient | undefined;

export function createClient() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(supabaseEnvErrorMessage());
  }
  if (!browserClient) {
    browserClient = createBrowserClient(env.url, env.anonKey);
  }
  return browserClient;
}
