'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthLayout } from '@/components/AuthLayout';
import { useAuth } from '@/hooks/useAuth';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const showWarning = searchParams.get('reason') === 'auth_required';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      const redirect = searchParams.get('redirect') || '/main';
      router.replace(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Вход" subtitle="Войдите в свой аккаунт Vellara">
      {showWarning && (
        <p className="auth-alert auth-alert--warning">Войдите в аккаунт, чтобы открыть эту страницу.</p>
      )}
      {error && <p className="auth-alert auth-alert--error">{error}</p>}
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="auth-label" htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            className="auth-input"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="login-password">Пароль</label>
          <input
            id="login-password"
            type="password"
            className="auth-input"
            required
            minLength={8}
            autoComplete="current-password"
            placeholder="Ваш пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Вход…' : 'Войти'}
        </button>
      </form>
      <p className="auth-footer">
        Нет аккаунта? <Link href="/">Зарегистрироваться</Link>
      </p>
    </AuthLayout>
  );
}
