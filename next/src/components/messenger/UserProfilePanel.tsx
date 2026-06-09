'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ImageLightbox } from '@/components/ImageLightbox';
import { ProfileShell } from '@/components/ProfileShell';
import { useCall } from '@/hooks/useCallManager';
import { StatusDot } from '@/components/StatusDot';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import { resolveProfileMedia } from '@/lib/profileCover';

type ProfileData = {
  id: string;
  name: string;
  last_name: string;
  email: string | null;
  profile: {
    avatar: string | null;
    background: string | null;
    background_gradient: string | null;
    bio: string | null;
  };
  is_owner: boolean;
  is_restricted: boolean;
  restriction_message?: string;
  is_online: boolean;
  last_seen_at: string | null;
};

export function UserProfilePanel({
  userId,
  isInContacts,
  onBack,
  onAddToContacts,
  onStartChat,
  onOpenSettings,
}: {
  userId: string;
  isInContacts?: boolean;
  onBack: () => void;
  onAddToContacts?: () => void;
  onStartChat?: (userId: string) => void;
  onOpenSettings?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<ProfileData | null>(null);
  const [avatarLightbox, setAvatarLightbox] = useState(false);
  const { startCall } = useCall();

  useEffect(() => {
    setLoading(true);
    setError('');
    api<ProfileData>(`/api/users/${userId}/profile`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="profile-page profile-page--state">
        <div className="profile-state">
          <span className="profile-spinner" />
          <p>Загрузка профиля…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="profile-page profile-page--state">
        <div className="profile-state profile-state--error">
          <p>{error || 'Профиль не найден'}</p>
          <button type="button" className="profile-btn profile-btn--outline profile-btn--with-icon" onClick={onBack}>
            <VellaraIcon name="back" size={18} />
            Назад
          </button>
        </div>
      </div>
    );
  }

  const media = resolveProfileMedia(data.profile);

  return (
    <ProfileShell
      displayName={`${data.name} ${data.last_name}`.trim()}
      avatarSrc={media.avatarSrc}
      avatarZoomable={!data.is_restricted && !!data.profile.avatar}
      onAvatarZoom={() => setAvatarLightbox(true)}
      coverStyle={{ backgroundImage: media.coverBackgroundImage }}
      coverActions={
        <button type="button" className="profile-btn profile-btn--ghost profile-btn--with-icon" onClick={onBack}>
          <VellaraIcon name="back" size={18} />
          Назад
        </button>
      }
      subtitle={
        <>
          <StatusDot isOnline={data.is_online} lastSeenAt={data.last_seen_at} showLabel />
          {data.email && (
            <span className="profile-email profile-email--with-icon">
              <VellaraIcon name="mail" size={14} />
              {data.email}
            </span>
          )}
        </>
      }
    >
      {data.is_restricted && (
        <div className="profile-alert profile-alert--error">
          {data.restriction_message || 'Профиль доступен только контактам'}
        </div>
      )}

      {!data.is_restricted && (
        <section className="profile-section">
          <h2 className="profile-section__label">О себе</h2>
          {data.profile.bio ? (
            <p className="profile-bio-text">{data.profile.bio}</p>
          ) : (
            <p className="profile-bio-empty">Пользователь пока ничего не написал о себе</p>
          )}
        </section>
      )}

      <div className={`profile-actions ${!data.is_owner ? 'profile-actions--stack' : ''}`}>
        {data.is_owner ? (
          <button
            type="button"
            className="profile-btn profile-btn--gold profile-btn--full profile-btn--with-icon"
            onClick={onOpenSettings}
          >
            <VellaraIcon name="settings" size={18} />
            Редактировать профиль
          </button>
        ) : (
          <>
            {!isInContacts && onAddToContacts && (
              <button type="button" className="profile-btn profile-btn--gold profile-btn--with-icon" onClick={onAddToContacts}>
                <VellaraIcon name="user-plus" size={18} />
                Добавить в контакты
              </button>
            )}
            {isInContacts && (
              <span className="profile-chip profile-chip--with-icon">
                <VellaraIcon name="check" size={14} />
                В ваших контактах
              </span>
            )}
            {onStartChat && (
              <button
                type="button"
                className="profile-btn profile-btn--outline profile-btn--with-icon"
                onClick={() => onStartChat(data.id)}
              >
                <VellaraIcon name="chats" size={18} />
                Написать
              </button>
            )}
            {isInContacts && (
              <>
                <button
                  type="button"
                  className="profile-btn profile-btn--outline profile-btn--with-icon"
                  onClick={() => startCall(data.id, 'voice').catch(() => {})}
                >
                  <VellaraIcon name="phone" size={18} />
                  Позвонить
                </button>
                <button
                  type="button"
                  className="profile-btn profile-btn--outline profile-btn--with-icon"
                  onClick={() => startCall(data.id, 'video').catch(() => {})}
                >
                  <VellaraIcon name="video-call" size={18} />
                  Видео
                </button>
              </>
            )}
          </>
        )}
      </div>

      {avatarLightbox && (
        <ImageLightbox urls={[media.avatarSrc]} onClose={() => setAvatarLightbox(false)} />
      )}
    </ProfileShell>
  );
}
