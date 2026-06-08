import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET_AVATARS = 'avatars';
const BUCKET_BACKGROUNDS = 'backgrounds';
const BUCKET_MESSAGES = 'messages';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif']);

function contentTypeForExtension(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'webm') return 'audio/webm';
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'm4a') return 'audio/mp4';
  return 'application/octet-stream';
}

function resolveFileTypeFromFile(file: File): string {
  const mime = file.type || '';
  const name = file.name.toLowerCase();
  const ext = name.split('.').pop() ?? '';

  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (mime.startsWith('audio/')) return 'voice';
  if (name.startsWith('voice.')) return 'voice';
  if (['webm', 'ogg', 'mp3', 'm4a', 'wav', 'opus', 'aac'].includes(ext)) {
    if (ext === 'webm' && mime.startsWith('video/')) return 'voice';
    return 'voice';
  }
  return 'document';
}

export async function uploadProfileImage(
  userId: string,
  file: File,
  kind: 'avatars' | 'backgrounds',
): Promise<string> {
  const bucket = kind === 'avatars' ? BUCKET_AVATARS : BUCKET_BACKGROUNDS;
  const fileName = file instanceof File ? file.name : 'avatar.jpg';
  const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const key = `${userId}/${Date.now()}.${safeExt === 'jpeg' ? 'jpg' : safeExt}`;
  const contentType = file.type || 'image/jpeg';
  const body = Buffer.from(await file.arrayBuffer());

  if (!body.byteLength) {
    throw new Error('Пустой файл изображения');
  }

  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).upload(key, body, {
    contentType,
    upsert: false,
  });

  if (error) throw new Error(error.message);
  return `${bucket}/${key}`;
}

export async function uploadMessageFile(
  userId: string,
  file: File,
): Promise<{ path: string; fileType: string; originalName: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const key = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const fileType = resolveFileTypeFromFile(file);
  const body = Buffer.from(await file.arrayBuffer());

  if (!body.byteLength) {
    throw new Error('Пустой файл');
  }

  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET_MESSAGES).upload(key, body, {
    contentType: file.type || contentTypeForExtension(ext),
    upsert: false,
  });

  if (error) throw error;

  return {
    path: `${BUCKET_MESSAGES}/${key}`,
    fileType,
    originalName: file.name,
  };
}
