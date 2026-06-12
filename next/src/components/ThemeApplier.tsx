'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { applyTheme } from '@/lib/applyTheme';

const VALID_THEMES = new Set(['gold-dark', 'midnight', 'forest', 'rose', 'light']);

export function ThemeApplier() {
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('vellara-messenger', 'vellara-auth');

    if (pathname?.startsWith('/main')) {
      html.classList.add('vellara-messenger');
    } else if (pathname === '/' || pathname === '/login') {
      html.classList.add('vellara-auth');
    }

    const theme = user?.theme && VALID_THEMES.has(user.theme) ? user.theme : 'gold-dark';
    applyTheme(theme);
  }, [pathname, user?.theme]);

  return null;
}
