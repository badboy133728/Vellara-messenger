import {
  contentTypeForExtension,
  isVideoAttachment,
  maxBytesForFile,
  resolveFileType,
} from '@/lib/chat/attachmentTypes';
import { uploadBlobInChunks } from '@/lib/chat/chunkedUploadClient';
import { CHAT_UPLOAD_MAX_BYTES, prepareChatImageForUpload } from '@/lib/chatImageUpload';

export type PreparedMessageFile =
  | { mode: 'inline'; file: File; fileType: string; encryptedOriginalName?: string }
  | { mode: 'uploaded'; path: string; fileType: string; originalName: string };

export type E2EFileTransform = {
  encryptBlob: (blob: Blob) => Promise<Blob>;
  encryptName: (name: string) => Promise<string>;
};

/** Vercel serverless: тело запроса ~4.5 MB — видео и крупные файлы грузим частями через API. */
export function shouldUploadDirectToStorage(file: File): boolean {
  if (isVideoAttachment(file)) return true;
  if (file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name)) {
    return false;
  }
  return file.size > CHAT_UPLOAD_MAX_BYTES;
}

async function prepareBody(file: File): Promise<{ body: Blob; sourceName: string }> {
  const fileType = resolveFileType(file.type, file.name);
  if (fileType === 'image') {
    const prepared = await prepareChatImageForUpload(file);
    return {
      body: prepared,
      sourceName: prepared.name,
    };
  }
  return { body: file, sourceName: file.name };
}

async function applyE2E(
  body: Blob,
  originalName: string,
  e2e?: E2EFileTransform,
): Promise<{ body: Blob; storedName: string }> {
  if (!e2e) return { body, storedName: originalName };
  const encrypted = await e2e.encryptBlob(body);
  const storedName = await e2e.encryptName(originalName);
  return { body: encrypted, storedName };
}

export async function uploadMessageFileClient(
  _userId: string,
  file: File,
  e2e?: E2EFileTransform,
): Promise<{ path: string; fileType: string; originalName: string }> {
  const fileType = resolveFileType(file.type, file.name);

  if (file.size > maxBytesForFile(file)) {
    throw new Error(fileType === 'video' ? 'Видео больше 50 МБ' : 'Файл больше 15 МБ');
  }

  const { body: rawBody, sourceName } = await prepareBody(file);
  const { body, storedName } = await applyE2E(rawBody, sourceName, e2e);
  const contentType = e2e ? 'application/octet-stream' : file.type || contentTypeForExtension(file.name.split('.').pop() ?? 'bin');

  return uploadBlobInChunks(body, e2e ? `${file.name}.e2e` : file.name, contentType).then((uploaded) => ({
    ...uploaded,
    fileType,
    originalName: storedName,
  }));
}

export async function prepareMessageFileForSend(
  userId: string,
  file: File,
  e2e?: E2EFileTransform,
): Promise<PreparedMessageFile> {
  if (shouldUploadDirectToStorage(file)) {
    const uploaded = await uploadMessageFileClient(userId, file, e2e);
    return { mode: 'uploaded', ...uploaded };
  }

  const fileType = resolveFileType(file.type, file.name);
  const { body: rawBody, sourceName } = await prepareBody(file);
  const { body, storedName } = await applyE2E(rawBody, sourceName, e2e);
  const uploadFile = new File([body], e2e ? 'encrypted.e2e' : sourceName, {
    type: e2e ? 'application/octet-stream' : body.type || file.type,
  });

  return {
    mode: 'inline',
    file: uploadFile,
    fileType,
    encryptedOriginalName: e2e ? storedName : undefined,
  };
}

export function appendPreparedFileToForm(form: FormData, prepared: PreparedMessageFile) {
  if (prepared.mode === 'inline') {
    form.append('file', prepared.file);
    form.append('file_type', prepared.fileType);
    if (prepared.encryptedOriginalName) {
      form.append('file_original_name', prepared.encryptedOriginalName);
    }
    return;
  }
  form.append('file_path', prepared.path);
  form.append('file_type', prepared.fileType);
  form.append('file_original_name', prepared.originalName);
}
