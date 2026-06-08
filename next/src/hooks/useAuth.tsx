'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, AUTH_UNAUTHORIZED_EVENT } from '@/lib/api';
import type { Profile } from '@/lib/types';

type AuthContextValue = {
  user: Profile | null;
  initialized: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [initialized, setInitialized] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const profile = await api<Profile | null>('/api/user', { allowUnauthorized: true });
      setUser(profile);
    } catch {
      setUser(null);
    } finally {
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      router.replace('/login?reason=session_expired&redirect=%2Fmain');
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router]);

  const login = async (email: string, password: string) => {
    const res = await api<{ user: Profile | null }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const profile =
      res.user ?? (await api<Profile | null>('/api/user', { allowUnauthorized: true }));
    if (!profile) {
      throw new Error('Вход выполнен, но профиль не создан. Обновите страницу.');
    }
    setUser(profile);
  };

  const register = async (data: Record<string, string>) => {
    const res = await api<{ user?: Profile; needs_email_confirmation?: boolean; message?: string }>(
      '/api/register',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
    if (res.needs_email_confirmation) {
      throw new Error(
        res.message ??
          'Аккаунт создан. Подтвердите email по ссылке из письма или отключите Confirm email в Supabase для локальной разработки.',
      );
    }
    if (res.user) {
      setUser(res.user);
    } else {
      await refresh();
    }
  };

  const logout = async () => {
    await api('/api/logout', { method: 'POST' });
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        initialized,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
