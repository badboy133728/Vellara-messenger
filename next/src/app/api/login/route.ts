import { NextRequest, NextResponse } from 'next/server';
import { ensureProfile } from '@/lib/auth';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ message: 'Email и пароль обязательны' }, { status: 422 });
  }

  const { supabase, withCookies } = createRouteHandlerClient(request);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const msg = error.message.toLowerCase().includes('email not confirmed')
      ? 'Подтвердите email по ссылке из письма или отключите Confirm email в Supabase для локальной разработки.'
      : 'Неверный email или пароль';
    return NextResponse.json({ message: msg }, { status: 422 });
  }

  let profile = (
    await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle()
  ).data;
  if (!profile) {
    profile = await ensureProfile(data.user);
  }

  return withCookies(
    NextResponse.json({
      message: 'Успешный вход',
      user: profile,
    }),
  );
}
