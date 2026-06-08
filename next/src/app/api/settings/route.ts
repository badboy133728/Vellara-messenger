import { requireAuth } from '@/lib/auth';
import { uploadProfileImage } from '@/lib/storage-server';

const THEMES = ['gold-dark', 'midnight', 'forest', 'rose', 'light'];
const GRADIENTS = ['gold', 'sunset', 'ocean', 'aurora', 'berry', 'slate', 'ember', 'lavender'];

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  return Response.json(formatSettings(auth.profile));
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, profile, supabase } = auth;

  const formData = await request.formData();
  const updates: Record<string, unknown> = {};

  const name = formData.get('name');
  const lastName = formData.get('last_name');
  const email = formData.get('email');
  const bio = formData.get('bio');
  const theme = formData.get('theme');
  const profileVisibility = formData.get('profile_visibility');
  const backgroundGradient = formData.get('background_gradient');

  if (name) updates.name = String(name);
  if (lastName !== null) updates.last_name = String(lastName ?? '');
  if (email) updates.email = String(email);
  if (bio !== null) updates.bio = String(bio ?? '');
  if (theme && THEMES.includes(String(theme))) updates.theme = String(theme);
  if (profileVisibility) updates.profile_visibility = String(profileVisibility);
  if (backgroundGradient && GRADIENTS.includes(String(backgroundGradient))) {
    updates.background_gradient = String(backgroundGradient);
  }

  if (formData.get('clear_background_gradient') === '1') {
    updates.background_gradient = null;
  }
  if (formData.get('clear_background_image') === '1') {
    updates.background = null;
  }
  if (formData.get('clear_avatar') === '1') {
    updates.avatar = null;
  }

  const avatarEntry = formData.get('avatar');
  const backgroundEntry = formData.get('background');
  const avatarFile = avatarEntry instanceof File && avatarEntry.size > 0 ? avatarEntry : null;
  const backgroundFile =
    backgroundEntry instanceof File && backgroundEntry.size > 0 ? backgroundEntry : null;

  try {
    if (avatarFile && avatarFile.size > 0) {
      updates.avatar = await uploadProfileImage(user.id, avatarFile, 'avatars');
    }
    if (backgroundFile && backgroundFile.size > 0) {
      updates.background = await uploadProfileImage(user.id, backgroundFile, 'backgrounds');
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Ошибка загрузки файла';
    return Response.json({ message }, { status: 500 });
  }

  if (Object.keys(updates).length > 0) {
    if (updates.email && updates.email !== profile.email) {
      await supabase.auth.updateUser({ email: String(updates.email) });
    }

    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select('*')
      .single();

    if (updateError) {
      return Response.json({ message: updateError.message }, { status: 500 });
    }
    if (!updated) {
      return Response.json({ message: 'Не удалось обновить профиль' }, { status: 500 });
    }

    return Response.json(formatSettings(updated));
  }

  return Response.json(formatSettings(profile));
}

function formatSettings(p: Record<string, unknown>) {
  return {
    id: p.id,
    name: p.name,
    last_name: p.last_name,
    email: p.email,
    bio: p.bio,
    theme: p.theme,
    profile_visibility: p.profile_visibility,
    background_gradient: p.background_gradient,
    avatar: p.avatar,
    background: p.background,
  };
}
