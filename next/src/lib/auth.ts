import { cache } from 'react';
import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Profile } from '@/lib/types';

export { isOnline } from '@/lib/presence';

export async function getSessionUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

async function fetchProfile(
  userId: string,
  supabase: SupabaseClient,
): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return data as Profile | null;
}

/** Кэш профиля в рамках одного server request. */
export const getProfile = cache(async (userId: string): Promise<Profile | null> => {
  const supabase = await createClient();
  return fetchProfile(userId, supabase);
});

/** Создаёт profiles, если auth.users есть, а триггер не отработал (старые аккаунты / ручной SQL). */
export async function ensureProfile(
  user: User,
  supabase?: SupabaseClient,
): Promise<Profile | null> {
  const client = supabase ?? (await createClient());
  const existing = await fetchProfile(user.id, client);
  if (existing) return existing;

  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.name === 'string' && meta.name) ||
    user.email?.split('@')[0] ||
    'User';
  const last_name = typeof meta.last_name === 'string' ? meta.last_name : '';

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: user.email ?? '',
        name,
        last_name,
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single();

  if (error || !data) return null;
  return data as Profile;
}

export async function requireAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }) };
  }
  let profile = await fetchProfile(user.id, supabase);
  if (!profile) {
    profile = await ensureProfile(user, supabase);
  }
  if (!profile) {
    return { error: NextResponse.json({ message: 'Profile not found' }, { status: 404 }) };
  }
  return { user, profile, supabase };
}
