import { getGradientCss } from '@/lib/data/gradients';
import { avatarUrlForUser, defaultAvatarUrl } from '@/lib/avatar';
import { storageDisplayUrl } from '@/lib/storage';

const DEFAULT_COVER =
  'linear-gradient(145deg, #2a2622 0%, #1a1a1a 45%, rgba(201, 168, 133, 0.22) 100%)';

type ProfileLike = {
  avatar?: string | null;
  background?: string | null;
  background_gradient?: string | null;
};

type Previews = {
  avatarPreview?: string | null;
  bgPreview?: string | null;
};

export function resolveProfileMedia(profile?: ProfileLike | null, previews: Previews = {}) {
  const avatarSrc = previews.avatarPreview
    || (profile?.avatar ? avatarUrlForUser({ avatar: profile.avatar, name: '', last_name: '' }) : defaultAvatarUrl());

  let coverBackgroundImage = DEFAULT_COVER;
  let coverImageUrl: string | null = null;

  if (previews.bgPreview) {
    coverImageUrl = previews.bgPreview;
    coverBackgroundImage = `url(${previews.bgPreview})`;
  } else if (profile?.background) {
    coverImageUrl = storageDisplayUrl(profile.background);
    if (coverImageUrl) coverBackgroundImage = `url(${coverImageUrl})`;
  } else if (profile?.background_gradient) {
    const gradient = getGradientCss(profile.background_gradient);
    if (gradient) coverBackgroundImage = gradient;
  }

  return { avatarSrc, coverBackgroundImage, coverImageUrl };
}

export function coverStyleFromMedia(
  media: ReturnType<typeof resolveProfileMedia>,
): { backgroundImage: string } {
  const v = media.coverImageUrl
    ? `url(${media.coverImageUrl})`
    : media.coverBackgroundImage;
  if (v.startsWith('url(') || v.startsWith('linear')) {
    return { backgroundImage: v };
  }
  return { backgroundImage: DEFAULT_COVER };
}
