export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  const placeholders = [
    !url,
    !anonKey,
    url?.includes('your-project'),
    anonKey === 'your-anon-key',
  ];

  if (placeholders.some(Boolean)) {
    return null;
  }

  return { url: url!, anonKey: anonKey! };
}

export function supabaseEnvErrorMessage() {
  return (
    'Supabase не настроен. Создайте next/.env.local с NEXT_PUBLIC_SUPABASE_URL и ' +
    'NEXT_PUBLIC_SUPABASE_ANON_KEY из Dashboard → Project Settings → API. ' +
    'После правки перезапустите: npm run dev'
  );
}
