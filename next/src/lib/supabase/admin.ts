import { createClient } from '@supabase/supabase-js';
import { supabaseGlobalFetch } from '@/lib/supabase/server-fetch';

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: supabaseGlobalFetch,
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
