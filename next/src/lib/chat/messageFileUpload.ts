import { createClient } from '@/lib/supabase/client';
import {
  contentTypeForExtension,
  isVideoAttachment,
  maxBytesForFile,
  resolveFileType,
} from '@/lib/chat/attachmentTypes';
import { CHAT_UPLOAD_MAX_BYTES, prepareChatImageForUpload } from '@/lib/chatImageUpload';

export type PreparedMessageFile =
  | { mode: 'inline'; file: File }
  | { mode: 'uploaded'; path: string; fileType: string; originalName: string };

/** Vercel serverless: тело запроса ~4.5 MB — видео и крупные файлы грузим в Storage с клиента. */
export function shouldUploadDirectToStorage(file: File): boolean {
  if (isVideoAttachment(file)) return true;
  if (file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name)) {
    return false;
  }
  return file.size > CHAT_UPLOAD_MAX_BYTES;
}

export async function uploadMessageFileClient(
  userId: string,
  file: File,
): Promise<{ path: string; fileType: string; originalName: string }> {
  const fileType = resolveFileType(file.type, file.name);

  if (file.size > maxBytesForFile(file)) {
    throw new Error(fileType === 'video' ? 'Видео больше 50 МБ' : 'Файл больше 15 МБ');
  }

  let body: File | Blob = file;
  let ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  let contentType = file.type || contentTypeForExtension(ext);

  if (fileType === 'image') {
    body = await prepareChatImageForUpload(file);
    const preparedName = body instanceof File ? body.name : file.name;
    ext = preparedName.split('.').pop()?.toLowerCase() ?? ext;
    contentType = body.type || contentType;
  }

  const key = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage.from('messages').upload(key, body, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(error.message || 'Не удалось загрузить файл');
  }

  return {
    path: `messages/${key}`,
    fileType,
    originalName: file.name,
  };
}

export async function prepareMessageFileForSend(
  userId: string,
  file: File,
): Promise<PreparedMessageFile> {
  if (shouldUploadDirectToStorage(file)) {
    const uploaded = await uploadMessageFileClient(userId, file);
    return { mode: 'uploaded', ...uploaded };
  }
  const uploadFile = await prepareChatImageForUpload(file);
  return { mode: 'inline', file: uploadFile };
}

export function appendPreparedFileToForm(form: FormData, prepared: PreparedMessageFile) {
  if (prepared.mode === 'inline') {
    form.append('file', prepared.file);
    return;
  }
  form.append('file_path', prepared.path);
  form.append('file_type', prepared.fileType);
  form.append('file_original_name', prepared.originalName);
}
