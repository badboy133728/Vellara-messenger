import { compressMessageImageBuffer } from '@/lib/chatImageCompressServer';
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
  const fileType = resolveFileTypeFromFile(file);
  let ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  let body: Buffer = Buffer.from(await file.arrayBuffer());
  let contentType = file.type || contentTypeForExtension(ext);

  if (!body.byteLength) {
    throw new Error('Пустой файл');
  }

  if (fileType === 'image') {
    const compressed = await compressMessageImageBuffer(body);
    if (compressed) {
      body = Buffer.from(compressed.buffer);
      ext = compressed.ext;
      contentType = compressed.contentType;
    }
  }

  const key = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET_MESSAGES).upload(key, body, {
    contentType,
    upsert: false,
  });

  if (error) throw error;

  return {
    path: `${BUCKET_MESSAGES}/${key}`,
    fileType,
    originalName: file.name,
  };
}

export async function copyMessageFile(
  sourcePath: string,
  userId: string,
  originalName: string,
  _fileType: string,
): Promise<string> {
  const slash = sourcePath.indexOf('/');
  if (slash === -1) {
    throw new Error('Некорректный путь к файлу');
  }

  const bucket = sourcePath.slice(0, slash);
  const key = sourcePath.slice(slash + 1);
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).download(key);

  if (error || !data) {
    throw new Error('Не удалось скопировать файл');
  }

  const body = Buffer.from(await data.arrayBuffer());
  if (!body.byteLength) {
    throw new Error('Пустой файл');
  }

  const ext =
    originalName.split('.').pop()?.toLowerCase() ??
    key.split('.').pop()?.toLowerCase() ??
    'bin';
  const contentType = contentTypeForExtension(ext);
  const newKey = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await admin.storage.from(BUCKET_MESSAGES).upload(newKey, body, {
    contentType,
    upsert: false,
  });

  if (uploadError) throw uploadError;

  return `${BUCKET_MESSAGES}/${newKey}`;
}
