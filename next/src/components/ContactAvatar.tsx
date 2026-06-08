'use client';

import { useEffect, useState } from 'react';
import { useStorageImageUrl } from '@/hooks/useStorageImageUrl';

export function ContactAvatar({
  name = '',
  lastName = '',
  avatar,
  online = false,
  variant = 'default',
  size = 'md',
}: {
  name?: string;
  lastName?: string;
  avatar?: string | null;
  online?: boolean;
  variant?: 'default' | 'request';
  size?: 'sm' | 'md' | 'lg';
}) {
  const src = useStorageImageUrl(avatar);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [avatar]);
  const letter = `${(name[0] || '').toUpperCase()}${(lastName[0] || '').toUpperCase()}` || '?';
  const sizeClass = size === 'sm' ? 'contact-avatar--sm' : size === 'lg' ? 'contact-avatar--lg' : '';
  const showImg = src && !failed;

  return (
    <span className="contact-avatar-wrap">
      <span
        className={`contact-avatar ${sizeClass} ${variant === 'request' ? 'contact-avatar--request' : ''}`}
      >
        {showImg ? (
          <img
            key={avatar ?? 'letter'}
            src={src}
            alt=""
            className="contact-avatar__img"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="contact-avatar__letter">{letter}</span>
        )}
      </span>
      {online && <span className="contact-online" title="В сети" />}
    </span>
  );
}
