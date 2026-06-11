export const PROFILE_GRADIENTS = [
  { id: 'gold', label: 'Золото', css: 'linear-gradient(135deg, #1a1612 0%, #3d3228 40%, #c9a885 100%)' },
  { id: 'sunset', label: 'Закат', css: 'linear-gradient(135deg, #1f0f1a 0%, #5c2a3a 45%, #e87b4a 100%)' },
  { id: 'ocean', label: 'Океан', css: 'linear-gradient(135deg, #0a1628 0%, #134e6f 50%, #38bdf8 100%)' },
  { id: 'aurora', label: 'Аврора', css: 'linear-gradient(135deg, #0f172a 0%, #312e81 45%, #10b981 100%)' },
  { id: 'berry', label: 'Ягоды', css: 'linear-gradient(135deg, #1a0a14 0%, #6b2148 50%, #c084fc 100%)' },
  { id: 'slate', label: 'Сланец', css: 'linear-gradient(135deg, #0f1419 0%, #334155 55%, #64748b 100%)' },
  { id: 'ember', label: 'Угли', css: 'linear-gradient(135deg, #140a06 0%, #7c2d12 50%, #fbbf24 100%)' },
  { id: 'lavender', label: 'Лаванда', css: 'linear-gradient(135deg, #1e1b2e 0%, #4c3d6b 50%, #a78bfa 100%)' },
] as const;

export function getGradientCss(id: string | null | undefined): string | null {
  if (!id) return null;
  return PROFILE_GRADIENTS.find((g) => g.id === id)?.css ?? null;
}
