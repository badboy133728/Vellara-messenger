export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp']);
const VOICE_EXTENSIONS = new Set(['ogg', 'mp3', 'm4a', 'wav', 'opus', 'aac']);

function fileExt(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function isVoiceFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.startsWith('voice.') || lower.includes('voice-message');
}

export function isImageAttachment(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name);
}

export function isVideoAttachment(file: File): boolean {
  return resolveFileType(file.type, file.name) === 'video';
}

export function maxBytesForFile(file: File): number {
  return isVideoAttachment(file) ? MAX_VIDEO_BYTES : MAX_DOCUMENT_BYTES;
}

export function resolveFileType(mime: string, fileName: string): string {
  const ext = fileExt(fileName);

  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image';

  if (isVoiceFileName(fileName)) return 'voice';
  if (mime.startsWith('audio/')) return 'voice';

  if (ext === 'webm') {
    if (mime.startsWith('audio/') || isVoiceFileName(fileName)) return 'voice';
    if (mime.startsWith('video/')) return 'video';
    return 'voice';
  }

  if (VOICE_EXTENSIONS.has(ext)) return 'voice';

  if (mime.startsWith('video/')) return 'video';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';

  return 'document';
}

/** Тип вложения с учётом E2E-имени (если в БД ошибочно document для encrypted.e2e). */
export function effectiveMessageFileType(msg: {
  file_path?: string | null;
  file_type?: string | null;
  file_original_name?: string | null;
  e2e_file_name?: string | null;
  voice_duration?: number | null;
}): string | null {
  if (!msg.file_path) return msg.file_type ?? null;
  if ((msg.voice_duration ?? 0) > 0) return 'voice';

  const plainName = (msg.e2e_file_name ?? msg.file_original_name ?? '').trim();
  if (plainName && !plainName.startsWith('e2e:v1:')) {
    const fromName = resolveFileType('', plainName);
    if (msg.file_type === 'document' || !msg.file_type) return fromName;
  }

  return msg.file_type ?? null;
}

export function mimeHintForMessageFile(msg: {
  file_type?: string | null;
  file_original_name?: string | null;
  e2e_file_name?: string | null;
}): string | undefined {
  const type = effectiveMessageFileType({ ...msg, file_path: 'x' });
  if (type === 'image') {
    const name = msg.e2e_file_name ?? msg.file_original_name ?? '';
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext && ext !== 'e2e') return contentTypeForExtension(ext);
    return 'image/jpeg';
  }
  if (type === 'video') return 'video/mp4';
  if (type === 'voice') return 'audio/ogg';
  return undefined;
}

export function contentTypeForExtension(ext: string): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'pdf':
      return 'application/pdf';
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    case '3gp':
      return 'video/3gpp';
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
      return 'video/x-msvideo';
    case 'ogg':
      return 'audio/ogg';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
    default:
      return 'application/octet-stream';
  }
}
