import { getSupabaseEnv } from '@/lib/supabase/env';

const PROXY_BUCKETS = new Set(['avatars', 'backgrounds', 'messages']);

export function parseStoragePath(path: string): { bucket: string; key: string } | null {
  let p = path.trim().replace(/^\/+/, '');
  if (p.startsWith('storage/v1/object/public/')) {
    p = p.slice('storage/v1/object/public/'.length);
  } else if (p.startsWith('storage/')) {
    p = p.slice('storage/'.length);
  }
  const slash = p.indexOf('/');
  if (slash <= 0) return null;
  return { bucket: p.slice(0, slash), key: p.slice(slash + 1) };
}

export function publicStorageUrl(path: string | null): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const env = getSupabaseEnv();
  const base = env?.url?.replace(/\/$/, '');
  if (!base) return null;

  const parsed = parseStoragePath(trimmed);
  if (!parsed) return null;

  return `${base}/storage/v1/object/public/${parsed.bucket}/${parsed.key}`;
}

/** Same-origin URL для <img> — обходит CORS/блокировки внешних Storage URL. */
export function storageProxyUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/api/storage/file')) return trimmed;

  const parsed = parseStoragePath(trimmed);
  if (!parsed || !PROXY_BUCKETS.has(parsed.bucket)) return null;

  return `/api/storage/file?path=${encodeURIComponent(trimmed)}`;
}

export function storageDisplayUrl(path: string | null | undefined): string | null {
  const proxy = storageProxyUrl(path);
  if (!proxy) return publicStorageUrl(path ?? null);
  const ts = path?.match(/(\d{10,})\./)?.[1];
  if (!ts) return proxy;
  return proxy.includes('?') ? `${proxy}&v=${ts}` : `${proxy}?v=${ts}`;
}
