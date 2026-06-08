import type { ReactNode } from 'react';

const AUTH_FEATURES = [
  'Личные и групповые чаты',
  'Голосовые сообщения и звонки',
  'Темы оформления и профиль',
];

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth-page">
      <div className="auth-page__brand">
        <div className="auth-brand">
          <span className="auth-brand__mark" aria-hidden="true">
            V
          </span>
          <h1 className="auth-brand__title">Vellara</h1>
          <p className="auth-brand__tagline">Messenger</p>
          <ul className="auth-features">
            {AUTH_FEATURES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="auth-page__form">
        <div className="auth-card">
          <header className="auth-card__header">
            <h2 className="auth-card__title">{title}</h2>
            <p className="auth-card__subtitle">{subtitle}</p>
          </header>
          {children}
          {footer}
        </div>
      </div>
    </div>
  );
}
