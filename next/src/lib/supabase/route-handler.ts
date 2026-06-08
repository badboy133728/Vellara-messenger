import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv, supabaseEnvErrorMessage } from '@/lib/supabase/env';
import { supabaseGlobalFetch } from '@/lib/supabase/server-fetch';

type PendingCookie = { name: string; value: string; options: CookieOptions };

/** Supabase client for Route Handlers — корректно прокидывает Set-Cookie в ответ */
export function createRouteHandlerClient(request: NextRequest) {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(supabaseEnvErrorMessage());
  }

  const pending: PendingCookie[] = [];

  const supabase = createServerClient(env.url, env.anonKey, {
    global: supabaseGlobalFetch,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        pending.push(...cookiesToSet);
      },
    },
  });

  function withCookies<T extends NextResponse>(response: T): T {
    pending.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return response;
  }

  return { supabase, withCookies };
}
