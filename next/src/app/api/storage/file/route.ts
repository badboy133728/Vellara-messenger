import { createAdminClient } from '@/lib/supabase/admin';
import { parseStoragePath } from '@/lib/storage';

const PUBLIC_BUCKETS = new Set(['avatars', 'backgrounds', 'messages']);

function contentTypeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

/** Отдаёт файл из Storage через наш origin — надёжнее для <img> чем внешний Supabase URL. */
export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get('path');
  if (!path) {
    return new Response('path required', { status: 422 });
  }

  const parsed = parseStoragePath(path);
  if (!parsed || !PUBLIC_BUCKETS.has(parsed.bucket)) {
    return new Response('Invalid path', { status: 422 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(parsed.bucket).download(parsed.key);
    if (error || !data) {
      return new Response('Not found', { status: 404 });
    }

    const bytes = await data.arrayBuffer();
    if (!bytes.byteLength) {
      return new Response('Empty file', { status: 404 });
    }

    return new Response(bytes, {
      headers: {
        'Content-Type': data.type || contentTypeForKey(parsed.key),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response('Error', { status: 500 });
  }
}
