'use client';

import { useAuth } from '@/hooks/useAuth';
import { VellaraIcon } from '@/components/icons/VellaraIcon';
import { ProfileShell } from '@/components/ProfileShell';
import { resolveProfileMedia } from '@/lib/profileCover';

export function DashboardPanel({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  const { user, logout } = useAuth();
  if (!user) return null;

  const media = resolveProfileMedia(user);

  return (
    <ProfileShell
      displayName={`${user.name} ${user.last_name}`.trim()}
      avatarSrc={media.avatarSrc}
      coverStyle={{ backgroundImage: media.coverBackgroundImage }}
      coverActions={<span className="profile-badge">Мой профиль</span>}
      subtitle={
        <span className="profile-email profile-email--with-icon">
          <VellaraIcon name="mail" size={14} />
          {user.email}
        </span>
      }
    >
      <section className="profile-section">
        <h2 className="profile-section__label">О себе</h2>
        {user.bio ? (
          <p className="profile-bio-text">{user.bio}</p>
        ) : (
          <p className="profile-bio-empty">Добавьте описание в настройках</p>
        )}
      </section>
      <div className="profile-actions profile-actions--stack">
        <button
          type="button"
          className="profile-btn profile-btn--gold profile-btn--full profile-btn--with-icon"
          onClick={onOpenSettings}
        >
          <VellaraIcon name="settings" size={18} />
          Редактировать профиль и настройки
        </button>
        <button type="button" className="profile-btn profile-btn--danger profile-btn--full" onClick={() => logout()}>
          Выйти из аккаунта
        </button>
      </div>
    </ProfileShell>
  );
}
