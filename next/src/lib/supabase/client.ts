import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv, supabaseEnvErrorMessage } from '@/lib/supabase/env';

export function createClient() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(supabaseEnvErrorMessage());
  }
  return createBrowserClient(env.url, env.anonKey);
}
