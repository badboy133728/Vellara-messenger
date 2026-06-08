import { storageDisplayUrl } from '@/lib/storage';

export function defaultAvatarUrl(): string {
  return 'https://ui-avatars.com/api/?name=V&background=222222&color=c9a885&size=128';
}

export function avatarUrlForUser(
  user: { name?: string; last_name?: string; avatar?: string | null },
  preview?: string | null,
): string {
  if (preview) return preview;
  const stored = storageDisplayUrl(user.avatar ?? null);
  if (stored) return stored;
  const name = encodeURIComponent(`${user.name ?? ''} ${user.last_name ?? ''}`.trim() || 'U');
  return `https://ui-avatars.com/api/?name=${name}&background=c9a885&color=1a1612&size=128`;
}
