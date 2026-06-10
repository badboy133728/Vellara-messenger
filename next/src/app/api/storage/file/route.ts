import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseStoragePath } from '@/lib/storage';
import { canAccessStoragePath } from '@/lib/storageAccess';

const ALLOWED_BUCKETS = new Set(['avatars', 'backgrounds', 'messages']);

function contentTypeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'heif') return 'image/heif';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'm4a') return 'audio/mp4';
  return 'application/octet-stream';
}

/** Файл из Storage через наш origin — только для авторизованных с проверкой доступа. */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const path = new URL(request.url).searchParams.get('path');
  if (!path) {
    return new Response('path required', { status: 422 });
  }

  const parsed = parseStoragePath(path);
  if (!parsed || !ALLOWED_BUCKETS.has(parsed.bucket)) {
    return new Response('Invalid path', { status: 422 });
  }

  const allowed = await canAccessStoragePath(supabase, user.id, path);
  if (!allowed) {
    return new Response('Forbidden', { status: 403 });
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
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Error', { status: 500 });
  }
}
