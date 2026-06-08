import { NextResponse } from 'next/server';
import { getProfile, getSessionUser, isOnline } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const current = await getSessionUser();
  if (!current) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const profile = await getProfile(id);
  if (!profile) {
    return NextResponse.json({ message: 'Пользователь не найден' }, { status: 404 });
  }

  const isOwner = current.id === id;

  if (!isOwner) {
    const visibility = profile.profile_visibility ?? 'everyone';
    if (visibility === 'contacts') {
      const { data: contact } = await supabase
        .from('user_contacts')
        .select('id')
        .eq('user_id', current.id)
        .eq('contact_id', id)
        .eq('status', 'accepted')
        .maybeSingle();

      if (!contact) {
        return Response.json({
          id: profile.id,
          name: profile.name,
          last_name: profile.last_name,
          email: null,
          profile: {
            avatar: profile.avatar,
            background: null,
            background_gradient: null,
            bio: null,
          },
          is_owner: false,
          is_restricted: true,
          restriction_message: 'Профиль доступен только контактам',
          is_online: isOnline(profile.last_seen_at),
          last_seen_at: profile.last_seen_at,
        });
      }
    }
  }

  return Response.json({
    id: profile.id,
    name: profile.name,
    last_name: profile.last_name,
    email: isOwner ? profile.email : null,
    profile: {
      avatar: profile.avatar,
      background: profile.background,
      background_gradient: profile.background_gradient,
      bio: profile.bio,
    },
    is_owner: isOwner,
    is_restricted: false,
    is_online: isOnline(profile.last_seen_at),
    last_seen_at: profile.last_seen_at,
  });
}
