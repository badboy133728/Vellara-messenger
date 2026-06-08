import { DEFAULT_THEME } from '@/lib/data/themes';

export function applyTheme(themeId?: string | null) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', themeId || DEFAULT_THEME);
}
