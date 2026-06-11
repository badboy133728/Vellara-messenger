import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseStoragePath, publicStorageUrl } from '@/lib/storage';
import { canAccessStoragePath } from '@/lib/storageAccess';

const ALLOWED_BUCKETS = new Set(['avatars', 'backgrounds', 'messages']);

/** Signed URL для файла в Storage — только после проверки доступа. */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const path = new URL(request.url).searchParams.get('path');
  if (!path) {
    return Response.json({ message: 'path required' }, { status: 422 });
  }

  const parsed = parseStoragePath(path);
  if (!parsed || !ALLOWED_BUCKETS.has(parsed.bucket)) {
    return Response.json({ message: 'Invalid path' }, { status: 422 });
  }

  const allowed = await canAccessStoragePath(supabase, user.id, path);
  if (!allowed) {
    return Response.json({ message: 'Forbidden' }, { status: 403 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.key, 60 * 60);

    if (!error && data?.signedUrl) {
      return Response.json({ url: data.signedUrl });
    }
  } catch {
    /* fallback below */
  }

  const publicUrl = publicStorageUrl(path);
  if (!publicUrl) {
    return Response.json({ message: 'URL unavailable' }, { status: 404 });
  }

  return Response.json({ url: publicUrl });
}
