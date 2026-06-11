import type { FormattedMessage } from '@/lib/types';

const CACHE_VERSION = 1;
const MAX_MESSAGES = 10;
const MAX_CONVERSATIONS = 48;

type CacheEntry = {
  messages: FormattedMessage[];
  savedAt: number;
};

type CacheStore = Record<string, CacheEntry>;

const memory = new Map<string, FormattedMessage[]>();

function cacheKey(userId: string, convId: number) {
  return `${userId}:${convId}`;
}

function storageKey(userId: string) {
  return `vellara-messages:v${CACHE_VERSION}:${userId}`;
}

function readStore(userId: string): CacheStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CacheStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(userId: string, store: CacheStore) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(store));
  } catch {
    /* quota or private mode */
  }
}

function trimStore(store: CacheStore): CacheStore {
  const entries = Object.entries(store);
  if (entries.length <= MAX_CONVERSATIONS) return store;
  entries.sort((a, b) => (b[1]?.savedAt ?? 0) - (a[1]?.savedAt ?? 0));
  return Object.fromEntries(entries.slice(0, MAX_CONVERSATIONS));
}

export function readCachedMessages(userId: string, convId: number): FormattedMessage[] {
  const memKey = cacheKey(userId, convId);
  const fromMemory = memory.get(memKey);
  if (fromMemory?.length) return fromMemory;

  const entry = readStore(userId)[String(convId)];
  const messages = Array.isArray(entry?.messages) ? entry.messages.slice(-MAX_MESSAGES) : [];
  if (messages.length) memory.set(memKey, messages);
  return messages;
}

export function writeCachedMessages(
  userId: string,
  convId: number,
  messages: FormattedMessage[],
) {
  if (!messages.length) return;
  const slice = messages.slice(-MAX_MESSAGES);
  const memKey = cacheKey(userId, convId);
  memory.set(memKey, slice);

  if (typeof window === 'undefined') return;
  const store = readStore(userId);
  store[String(convId)] = { messages: slice, savedAt: Date.now() };
  writeStore(userId, trimStore(store));
}
