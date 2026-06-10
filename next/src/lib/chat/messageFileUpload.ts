import {
  contentTypeForExtension,
  isVideoAttachment,
  maxBytesForFile,
  resolveFileType,
} from '@/lib/chat/attachmentTypes';
import { uploadBlobInChunks } from '@/lib/chat/chunkedUploadClient';
import { CHAT_UPLOAD_MAX_BYTES, prepareChatImageForUpload } from '@/lib/chatImageUpload';

export type PreparedMessageFile =
  | { mode: 'inline'; file: File }
  | { mode: 'uploaded'; path: string; fileType: string; originalName: string };

/** Vercel serverless: тело запроса ~4.5 MB — видео и крупные файлы грузим частями через API. */
export function shouldUploadDirectToStorage(file: File): boolean {
  if (isVideoAttachment(file)) return true;
  if (file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name)) {
    return false;
  }
  return file.size > CHAT_UPLOAD_MAX_BYTES;
}

export async function uploadMessageFileClient(
  _userId: string,
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

  return uploadBlobInChunks(body, file.name, contentType);
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
