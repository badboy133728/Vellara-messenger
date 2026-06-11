import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseGlobalFetch } from '@/lib/supabase/server-fetch';

let adminClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        global: supabaseGlobalFetch,
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
  }
  return adminClient;
}
