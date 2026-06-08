'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { defaultAvatarUrl } from '@/lib/avatar';

const DEFAULT_COVER =
  'linear-gradient(145deg, #2a2622 0%, #1a1a1a 45%, rgba(201, 168, 133, 0.22) 100%)';

export function ProfileShell({
  displayName,
  avatarSrc,
  coverStyle,
  coverActions,
  subtitle,
  children,
  avatarZoomable = false,
  onAvatarZoom,
}: {
  displayName: string;
  avatarSrc: string;
  coverStyle?: CSSProperties;
  coverActions?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  avatarZoomable?: boolean;
  onAvatarZoom?: () => void;
}) {
  const [imgSrc, setImgSrc] = useState(avatarSrc);

  return (
    <div className="profile-page">
      <div className="profile-card">
        <header className="profile-hero">
          <div
            className="profile-cover"
            style={coverStyle ?? { backgroundImage: DEFAULT_COVER }}
          >
            <div className="profile-cover__shade" />
            {coverActions && <div className="profile-cover__actions">{coverActions}</div>}
          </div>
          <div className="profile-hero__inner">
            <div className="profile-avatar-wrap">
              <div
                className={`profile-avatar ${avatarZoomable ? 'profile-avatar--zoomable' : ''}`}
                role={avatarZoomable ? 'button' : undefined}
                tabIndex={avatarZoomable ? 0 : undefined}
                onClick={avatarZoomable ? onAvatarZoom : undefined}
                onKeyDown={
                  avatarZoomable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') onAvatarZoom?.();
                      }
                    : undefined
                }
              >
                <img
                  src={imgSrc}
                  alt={displayName}
                  onError={() => setImgSrc(defaultAvatarUrl())}
                />
              </div>
            </div>
            <div className="profile-identity">
              <h1 className="profile-name">{displayName}</h1>
              {subtitle && <div className="profile-subtitle">{subtitle}</div>}
            </div>
          </div>
        </header>
        <div className="profile-body">{children}</div>
      </div>
    </div>
  );
}
