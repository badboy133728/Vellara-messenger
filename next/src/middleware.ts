import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { touchLastSeen } from '@/lib/presence';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const env = getSupabaseEnv();
  if (!env) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Обновляем сессию на КАЖДОМ запросе (включая /api/*), иначе JWT протухает → 401.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    try {
      await touchLastSeen(supabase, user.id);
    } catch {
      /* ignore presence errors */
    }
  }

  const isApi = path.startsWith('/api/');
  const isPublicPage = path === '/' || path === '/login';

  if (!isApi) {
    if (!user && !isPublicPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('reason', 'auth_required');
      url.searchParams.set('redirect', path);
      return NextResponse.redirect(url);
    }

    if (user && (path === '/' || path === '/login')) {
      const url = request.nextUrl.clone();
      url.pathname = '/main';
      url.searchParams.delete('reason');
      url.searchParams.delete('redirect');
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)',
  ],
};
