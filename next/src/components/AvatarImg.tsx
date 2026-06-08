'use client';

import { useEffect, useMemo, useState } from 'react';
import { avatarUrlForUser } from '@/lib/avatar';
import { useStorageImageUrl } from '@/hooks/useStorageImageUrl';

/** Аватар с fallback на ui-avatars. */
export function AvatarImg({
  avatar,
  name = '',
  lastName = '',
  className = '',
  alt = '',
}: {
  avatar?: string | null;
  name?: string;
  lastName?: string;
  className?: string;
  alt?: string;
}) {
  const storageUrl = useStorageImageUrl(avatar);
  const fallback = useMemo(
    () => avatarUrlForUser({ name, last_name: lastName }),
    [name, lastName],
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [avatar, storageUrl]);

  const src = storageUrl && !failed ? storageUrl : fallback;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
