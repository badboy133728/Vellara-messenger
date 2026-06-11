const RECENT_KEY = 'vellara-recent-emojis';
const RECENT_MAX = 32;

export const defaultRecentEmojis = ['👍', '😊', '😂', '❤️', '🔥', '🙏', '😍', '🎉'];

export function loadRecentEmojis(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecentEmoji(emoji: string): string[] {
  const next = [emoji, ...loadRecentEmojis().filter((e) => e !== emoji)].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}
