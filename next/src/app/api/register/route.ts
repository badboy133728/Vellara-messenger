import { NextRequest, NextResponse } from 'next/server';
import { ensureProfile } from '@/lib/auth';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Этот email уже зарегистрирован. Войдите или восстановите пароль.';
  }
  if (m.includes('password')) {
    return 'Пароль не подходит под требования Supabase (минимум 6–8 символов).';
  }
  if (m.includes('invalid') && m.includes('email')) {
    return 'Некорректный email.';
  }
  if (
    m.includes('signups not allowed') ||
    m.includes('signup') && m.includes('disabled') ||
    m.includes('not allowed for this instance')
  ) {
    return (
      'Регистрация отключена в Supabase. Включите: Dashboard → Authentication → ' +
      'Providers → Email → Enable Email provider ON, и в Authentication → Settings → ' +
      '«Allow new users to sign up» ON.'
    );
  }
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return (
      'Превышен лимит отправки писем Supabase. Подождите ~1 час или отключите подтверждение email: ' +
      'Dashboard → Authentication → Providers → Email → Confirm email OFF (для локальной разработки).'
    );
  }
  if (m.includes('fetch failed') || m.includes('connect timeout')) {
    return (
      'Не удалось подключиться к Supabase (таймаут сети). Проверьте интернет и DNS. ' +
      'При медленном соединении увеличьте SUPABASE_CONNECT_TIMEOUT_MS в .env.local.'
    );
  }
  return message;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, last_name, email, password, password_confirmation } = body;

  if (!name || !last_name || !email || !password) {
    return NextResponse.json({ message: 'Заполните все поля' }, { status: 422 });
  }
  if (password.length < 8) {
    return NextResponse.json({ message: 'Пароль минимум 8 символов' }, { status: 422 });
  }
  if (password !== password_confirmation) {
    return NextResponse.json({ message: 'Пароли не совпадают' }, { status: 422 });
  }

  const { supabase, withCookies } = createRouteHandlerClient(request);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, last_name },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/login`,
    },
  });

  if (error) {
    return NextResponse.json({ message: mapAuthError(error.message) }, { status: 422 });
  }

  if (data.user && !data.session) {
    return withCookies(
      NextResponse.json({
        message:
          'Аккаунт создан. Подтвердите email по ссылке из письма, затем войдите. ' +
          'Для локальной разработки можно отключить подтверждение: Supabase → Authentication → Providers → Email → Confirm email OFF.',
        needs_email_confirmation: true,
      }),
    );
  }

  let profile = data.user
    ? (await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle()).data
    : null;
  if (data.user && !profile) {
    profile = await ensureProfile(data.user);
  }

  return withCookies(
    NextResponse.json({ message: 'Успешно', user: profile }, { status: 201 }),
  );
}
