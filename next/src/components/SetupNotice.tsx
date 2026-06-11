'use client';

export function SetupNotice() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const missing =
    !url ||
    !key ||
    url.includes('your-project') ||
    key === 'your-anon-key';

  if (!missing) return null;

  return (
    <div className="setup-notice" role="alert">
      <strong>Supabase не настроен.</strong>
      <p>
        Откройте <code>next/.env.local</code> и укажите ключи из{' '}
        <a
          href="https://supabase.com/dashboard/project/_/settings/api"
          target="_blank"
          rel="noreferrer"
        >
          Supabase → Project Settings → API
        </a>
        :
      </p>
      <ul>
        <li><code>NEXT_PUBLIC_SUPABASE_URL</code> — Project URL</li>
        <li><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> — anon / publishable key</li>
        <li><code>SUPABASE_SERVICE_ROLE_KEY</code> — service_role (секретный)</li>
      </ul>
      <p>После сохранения перезапустите: <code>npm run dev</code></p>
    </div>
  );
}
