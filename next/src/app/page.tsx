'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthLayout } from '@/components/AuthLayout';
import { useAuth } from '@/hooks/useAuth';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({
    name: '',
    last_name: '',
    email: '',
    password: '',
    password_confirmation: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await register(form);
      setSuccess('Аккаунт создан! Переход в мессенджер…');
      setTimeout(() => router.push('/main'), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Регистрация" subtitle="Создайте аккаунт и начните общаться">
      {success && <p className="auth-alert auth-alert--success">{success}</p>}
      {error && <p className="auth-alert auth-alert--error">{error}</p>}
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-row-2">
          <div className="auth-field">
            <label className="auth-label" htmlFor="reg-name">Имя</label>
            <input
              id="reg-name"
              className="auth-input"
              required
              placeholder="Иван"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="reg-lastname">Фамилия</label>
            <input
              id="reg-lastname"
              className="auth-input"
              required
              placeholder="Иванов"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            />
          </div>
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-email">Email</label>
          <input
            id="reg-email"
            type="email"
            className="auth-input"
            required
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-password">Пароль</label>
          <input
            id="reg-password"
            type="password"
            className="auth-input"
            required
            minLength={8}
            placeholder="Минимум 8 символов"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="reg-password-confirm">Подтверждение пароля</label>
          <input
            id="reg-password-confirm"
            type="password"
            className="auth-input"
            required
            minLength={8}
            placeholder="Повторите пароль"
            value={form.password_confirmation}
            onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
          />
        </div>
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
        </button>
      </form>
      <p className="auth-footer">
        Уже есть аккаунт? <Link href="/login">Войти</Link>
      </p>
    </AuthLayout>
  );
}
