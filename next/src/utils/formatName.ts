/** Первая буква каждого слова с заглавной (латиница и кириллица). */
export function capitalizeNamePart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  return trimmed
    .split(/(\s+|-)/)
    .map((part) => {
      if (!part || /^\s+$/.test(part) || part === '-') return part;
      const lower = part.toLocaleLowerCase('ru-RU');
      return lower.charAt(0).toLocaleUpperCase('ru-RU') + lower.slice(1);
    })
    .join('');
}

export function formatPersonName(
  name: string,
  lastName = '',
): { name: string; last_name: string } {
  return {
    name: capitalizeNamePart(name),
    last_name: capitalizeNamePart(lastName),
  };
}

export function displayFullName(
  name?: string | null,
  lastName?: string | null,
  fallback = 'Контакт',
): string {
  const parts = [capitalizeNamePart(name ?? ''), capitalizeNamePart(lastName ?? '')].filter(Boolean);
  return parts.join(' ') || fallback;
}
