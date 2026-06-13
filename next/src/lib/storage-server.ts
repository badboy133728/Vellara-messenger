import {
  contentTypeForExtension,
  maxBytesForFile,
  resolveFileType,
} from '@/lib/chat/attachmentTypes';
import { compressMessageImageBuffer } from '@/lib/chatImageCompressServer';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET_AVATARS = 'avatars';
const BUCKET_BACKGROUNDS = 'backgrounds';
const BUCKET_MESSAGES = 'messages';

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

export async function uploadConversationAvatar(
  conversationId: number,
  file: File,
): Promise<string> {
  const fileName = file instanceof File ? file.name : 'avatar.jpg';
  const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const key = `conversations/${conversationId}/${Date.now()}.${safeExt === 'jpeg' ? 'jpg' : safeExt}`;
  const contentType = file.type || 'image/jpeg';
  const body = Buffer.from(await file.arrayBuffer());

  if (!body.byteLength) {
    throw new Error('Пустой файл изображения');
  }

  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET_AVATARS).upload(key, body, {
    contentType,
    upsert: false,
  });

  if (error) throw new Error(error.message);
  return `${BUCKET_AVATARS}/${key}`;
}

export async function uploadMessageFile(
  userId: string,
  file: File,
): Promise<{ path: string; fileType: string; originalName: string }> {
  const fileType = resolveFileType(file.type, file.name);

  if (file.size > maxBytesForFile(file)) {
    throw new Error(fileType === 'video' ? 'Видео больше 50 МБ' : 'Файл больше 15 МБ');
  }
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
