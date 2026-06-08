import { createAdminClient } from '@/lib/supabase/admin';
import { parseStoragePath, publicStorageUrl } from '@/lib/storage';

const PUBLIC_BUCKETS = new Set(['avatars', 'backgrounds', 'messages']);

/** Публичный или signed URL для файла в Storage (без сессии — только avatars/backgrounds/messages). */
export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get('path');
  if (!path) {
    return Response.json({ message: 'path required' }, { status: 422 });
  }

  const parsed = parseStoragePath(path);
  if (!parsed || !PUBLIC_BUCKETS.has(parsed.bucket)) {
    return Response.json({ message: 'Invalid path' }, { status: 422 });
  }

  const publicUrl = publicStorageUrl(path);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.key, 60 * 60 * 24);

    if (!error && data?.signedUrl) {
      return Response.json({ url: data.signedUrl });
    }
  } catch {
    /* fallback to public */
  }

  if (!publicUrl) {
    return Response.json({ message: 'URL unavailable' }, { status: 404 });
  }

  return Response.json({ url: publicUrl });
}
