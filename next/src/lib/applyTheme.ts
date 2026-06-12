import { DEFAULT_THEME } from '@/lib/data/themes';

const THEME_BAR_COLORS: Record<string, string> = {
  'gold-dark': '#121212',
  midnight: '#0a0f1a',
  forest: '#0d1410',
  rose: '#140c10',
  light: '#f4f4f5',
};

function applyThemeColor(themeId: string) {
  if (typeof document === 'undefined') return;
  const color = THEME_BAR_COLORS[themeId] ?? THEME_BAR_COLORS[DEFAULT_THEME];
  const root = document.documentElement;
  root.style.backgroundColor = color;
  if (document.body) document.body.style.backgroundColor = color;

  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);
}

export function applyTheme(themeId?: string | null) {
  if (typeof document === 'undefined') return;
  const nextTheme = themeId || DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', nextTheme);
  applyThemeColor(nextTheme);
}
