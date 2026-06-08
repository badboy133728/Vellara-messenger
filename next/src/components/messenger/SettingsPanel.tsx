'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { APP_THEMES } from '@/lib/data/themes';
import { PROFILE_GRADIENTS } from '@/lib/data/gradients';
import { applyTheme } from '@/lib/applyTheme';
import { resolveProfileMedia } from '@/lib/profileCover';
import { AvatarCropModal } from '@/components/AvatarCropModal';
import { AvatarImg } from '@/components/AvatarImg';
import { PushNotificationsSection } from '@/components/PushNotificationsSection';

type SettingsData = {
  name: string;
  last_name: string;
  email: string;
  bio: string;
  theme: string;
  profile_visibility: string;
  background_gradient: string | null;
  avatar: string | null;
  background: string | null;
};

export function SettingsPanel({
  showMobileBack = false,
  onBack,
}: {
  showMobileBack?: boolean;
  onBack?: () => void;
} = {}) {
  const { refresh, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [savedProfile, setSavedProfile] = useState<Partial<SettingsData>>({});
  const [form, setForm] = useState<SettingsData>({
    name: '',
    last_name: '',
    email: '',
    bio: '',
    theme: 'gold-dark',
    profile_visibility: 'everyone',
    background_gradient: null,
    avatar: null,
    background: null,
  });
  const [bgMode, setBgMode] = useState<'gradient' | 'image' | 'default'>('default');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [pendingBg, setPendingBg] = useState<File | null>(null);
  const [avatarMarkedForRemoval, setAvatarMarkedForRemoval] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);

  const displayName = `${form.name} ${form.last_name}`.trim();

  const media = useMemo(
    () =>
      resolveProfileMedia(
        {
          avatar: avatarMarkedForRemoval ? null : savedProfile.avatar,
          background: bgMode === 'image' ? savedProfile.background : null,
          background_gradient: bgMode === 'gradient' ? form.background_gradient : null,
        },
        { avatarPreview, bgPreview },
      ),
    [avatarMarkedForRemoval, savedProfile, bgMode, form.background_gradient, avatarPreview, bgPreview],
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    api<SettingsData>('/api/settings')
      .then((data) => {
        setForm(data);
        setSavedProfile(data);
        if (data.background) setBgMode('image');
        else if (data.background_gradient) setBgMode('gradient');
        else setBgMode('default');
        applyTheme(data.theme);
      })
      .catch(() => setErrorMessage('Не удалось загрузить настройки'))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const selectTheme = (id: string) => {
    setForm((f) => ({ ...f, theme: id }));
    applyTheme(id);
  };

  const save = async () => {
    setSaving(true);
    setErrorMessage('');
    setSaveMessage('');
    const prevTheme = document.documentElement.getAttribute('data-theme');
    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('last_name', form.last_name);
      fd.append('email', form.email);
      fd.append('bio', form.bio);
      fd.append('theme', form.theme);
      fd.append('profile_visibility', form.profile_visibility);
      if (form.background_gradient) fd.append('background_gradient', form.background_gradient);
      if (bgMode === 'default') {
        fd.append('clear_background_gradient', '1');
        fd.append('clear_background_image', '1');
      }
      if (avatarMarkedForRemoval) fd.append('clear_avatar', '1');
      if (pendingAvatar) fd.append('avatar', pendingAvatar);
      if (pendingBg) fd.append('background', pendingBg);

      const hadPendingAvatar = !!pendingAvatar;
      const updated = await api<SettingsData>('/api/settings', {
        method: 'POST',
        body: fd,
        headers: {},
      });
      if (hadPendingAvatar && !updated.avatar) {
        throw new Error('Фото не сохранилось. Проверьте bucket avatars в Supabase.');
      }
      setForm(updated);
      setSavedProfile(updated);
      setPendingAvatar(null);
      setPendingBg(null);
      setAvatarPreview(null);
      setBgPreview(null);
      setAvatarMarkedForRemoval(false);
      await refresh();
      setSaveMessage('Настройки сохранены');
      applyTheme(updated.theme);
    } catch (err) {
      if (prevTheme) applyTheme(prevTheme);
      setErrorMessage(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const mobileBar =
    showMobileBack && onBack ? (
      <div className="settings-page__mobile-bar">
        <button type="button" className="settings-page__back" onClick={onBack}>
          ← Назад
        </button>
      </div>
    ) : null;

  if (loading) {
    return (
      <div className="settings-page settings-loading">
        {mobileBar}
        <p>Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      {mobileBar}
      <header className="settings-header">
        <h1>Настройки</h1>
        <p>Аккаунт, оформление профиля и приватность</p>
      </header>

      <section className="settings-preview" aria-label="Предпросмотр профиля">
        <div
          className="settings-preview__cover"
          style={{ backgroundImage: media.coverBackgroundImage }}
        >
          <div className="settings-preview__shade" />
        </div>
        <div className="settings-preview__row">
          <div className="settings-preview__avatar">
            {avatarPreview ? (
              <img src={avatarPreview} alt="" />
            ) : (
              <AvatarImg
                key={savedProfile.avatar ?? 'no-avatar'}
                avatar={avatarMarkedForRemoval ? null : savedProfile.avatar}
                name={form.name}
                lastName={form.last_name}
              />
            )}
          </div>
          <div>
            <strong>{displayName || 'Ваше имя'}</strong>
            <span>{form.email || 'email@example.com'}</span>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <h2>Аккаунт</h2>
        <div className="settings-grid">
          <label className="settings-field">
            <span>Имя</span>
            <input
              className="profile-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="settings-field">
            <span>Фамилия</span>
            <input
              className="profile-field"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </label>
          <label className="settings-field settings-field--full">
            <span>Электронная почта</span>
            <input
              type="email"
              className="profile-field"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="settings-field settings-field--full">
            <span>О себе</span>
            <textarea
              className="profile-field"
              rows={3}
              maxLength={500}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
            <span className="profile-char-count">{form.bio.length} / 500</span>
          </label>
        </div>
      </section>

      <section className="settings-card">
        <h2>Аватар</h2>
        <div className="settings-media-row">
          <div className="settings-thumb settings-thumb--round">
            {avatarPreview ? (
              <img src={avatarPreview} alt="" />
            ) : (
              <AvatarImg
                key={savedProfile.avatar ?? 'no-avatar'}
                avatar={avatarMarkedForRemoval ? null : savedProfile.avatar}
                name={form.name}
                lastName={form.last_name}
              />
            )}
          </div>
          <div className="settings-media-actions">
            <p className="settings-hint">Любой размер — после сохранения фото сжимается на сервере</p>
            <button
              type="button"
              className="profile-btn profile-btn--gold"
              onClick={() => avatarInput.current?.click()}
            >
              Выбрать фото
            </button>
            {(savedProfile.avatar || pendingAvatar || avatarMarkedForRemoval) && (
              <button
                type="button"
                className="profile-btn profile-btn--outline"
                onClick={() => {
                  if (avatarMarkedForRemoval) {
                    setAvatarMarkedForRemoval(false);
                  } else {
                    setPendingAvatar(null);
                    setAvatarPreview(null);
                    if (savedProfile.avatar) setAvatarMarkedForRemoval(true);
                  }
                }}
              >
                {avatarMarkedForRemoval ? 'Отменить удаление' : 'Удалить фото'}
              </button>
            )}
          </div>
        </div>
        <input
          ref={avatarInput}
          type="file"
          accept="image/*"
          className="file-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setCropFile(file);
            setAvatarMarkedForRemoval(false);
            if (avatarInput.current) avatarInput.current.value = '';
          }}
        />
        <AvatarCropModal
          open={!!cropFile}
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={(file) => {
            setPendingAvatar(file);
            setAvatarPreview(URL.createObjectURL(file));
            setCropFile(null);
          }}
        />
      </section>

      <section className="settings-card">
        <h2>Фон профиля</h2>
        <div className="settings-tabs">
          <button type="button" className={bgMode === 'gradient' ? 'active' : ''} onClick={() => setBgMode('gradient')}>
            Градиенты
          </button>
          <button type="button" className={bgMode === 'image' ? 'active' : ''} onClick={() => setBgMode('image')}>
            Своё фото
          </button>
          <button
            type="button"
            className={bgMode === 'default' ? 'active' : ''}
            onClick={() => {
              setBgMode('default');
              setForm((f) => ({ ...f, background_gradient: null }));
              setPendingBg(null);
              setBgPreview(null);
            }}
          >
            По умолчанию
          </button>
        </div>
        {bgMode === 'gradient' && (
          <div className="settings-gradients">
            {PROFILE_GRADIENTS.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`settings-gradient ${form.background_gradient === g.id ? 'active' : ''}`}
                style={{ backgroundImage: g.css }}
                onClick={() => {
                  setForm((f) => ({ ...f, background_gradient: g.id }));
                  setBgMode('gradient');
                }}
              >
                <span>{g.label}</span>
              </button>
            ))}
          </div>
        )}
        {bgMode === 'image' && (
          <div className="settings-media-row">
            <div
              className="settings-thumb settings-thumb--wide"
              style={{ backgroundImage: media.coverBackgroundImage }}
            />
            <div className="settings-media-actions">
              <button type="button" className="profile-btn profile-btn--gold" onClick={() => bgInput.current?.click()}>
                Выбрать фото
              </button>
            </div>
          </div>
        )}
        {bgMode === 'default' && (
          <p className="settings-hint">Используется стандартный фон Vellara</p>
        )}
        <input
          ref={bgInput}
          type="file"
          accept="image/*"
          className="file-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPendingBg(file);
            setBgPreview(URL.createObjectURL(file));
            setBgMode('image');
            setForm((f) => ({ ...f, background_gradient: null }));
          }}
        />
      </section>

      <section className="settings-card">
        <h2>Тема интерфейса</h2>
        <p className="settings-hint">Применяется ко всему мессенджеру</p>
        <div className="settings-themes">
          {APP_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`settings-theme ${form.theme === t.id ? 'active' : ''}`}
              onClick={() => selectTheme(t.id)}
            >
              <span className="settings-theme__swatch">
                <i style={{ background: t.preview[0] }} />
                <i style={{ background: t.preview[1] }} />
              </span>
              <strong>{t.label}</strong>
              <small>{t.description}</small>
            </button>
          ))}
        </div>
      </section>

      <PushNotificationsSection />

      <section className="settings-card">
        <h2>Приватность</h2>
        <p className="settings-hint">Кто может видеть ваш профиль, био и фон</p>
        <label className="settings-radio">
          <input
            type="radio"
            name="visibility"
            checked={form.profile_visibility === 'everyone'}
            onChange={() => setForm({ ...form, profile_visibility: 'everyone' })}
          />
          <span>
            <strong>Все пользователи</strong>
            <small>Любой зарегистрированный пользователь</small>
          </span>
        </label>
        <label className="settings-radio">
          <input
            type="radio"
            name="visibility"
            checked={form.profile_visibility === 'contacts'}
            onChange={() => setForm({ ...form, profile_visibility: 'contacts' })}
          />
          <span>
            <strong>Только контакты</strong>
            <small>Только принятые контакты видят полный профиль</small>
          </span>
        </label>
      </section>

      {errorMessage && <div className="profile-alert profile-alert--error">{errorMessage}</div>}
      {saveMessage && <div className="profile-alert profile-alert--success">{saveMessage}</div>}

      <div className="settings-footer">
        <button
          type="button"
          className="profile-btn profile-btn--gold profile-btn--full"
          disabled={saving}
          onClick={save}
        >
          {saving ? 'Сохранение…' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  );
}
