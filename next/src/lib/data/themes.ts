export const APP_THEMES = [
  {
    id: 'gold-dark',
    label: 'Vellara',
    description: 'Тёмная с золотым акцентом',
    preview: ['#121212', '#c9a885'],
  },
  {
    id: 'midnight',
    label: 'Полночь',
    description: 'Синие холодные тона',
    preview: ['#0a0f1a', '#3b82f6'],
  },
  {
    id: 'forest',
    label: 'Лес',
    description: 'Зелёные природные оттенки',
    preview: ['#0d1410', '#34d399'],
  },
  {
    id: 'rose',
    label: 'Роза',
    description: 'Тёплый розово-бордовый',
    preview: ['#140c10', '#f472b6'],
  },
  {
    id: 'light',
    label: 'Светлая',
    description: 'Светлый интерфейс',
    preview: ['#f4f4f5', '#a8845f'],
  },
] as const;

export const DEFAULT_THEME = 'gold-dark';
