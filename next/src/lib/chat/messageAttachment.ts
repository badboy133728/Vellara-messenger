import { maxBytesForFile } from '@/lib/chat/attachmentTypes';
import { uploadMessageFile } from '@/lib/storage-server';

export type MessageAttachmentInput =
  | { kind: 'file'; file: File; originalNameOverride?: string; fileTypeHint?: string }
  | { kind: 'uploaded'; path: string; fileType: string; originalName: string };

export function isValidUserMessagePath(path: string, userId: string): boolean {
  const prefix = `messages/${userId}/`;
  return path.startsWith(prefix) && !path.includes('..');
}

export function getMessageAttachmentFromForm(formData: FormData): MessageAttachmentInput | null {
  const file = formData.get('file');
  const inlineOriginalName = (formData.get('file_original_name') as string | null)?.trim();
  const fileTypeHint = (formData.get('file_type') as string | null)?.trim();
  if (file instanceof File && file.size > 0) {
    return {
      kind: 'file',
      file,
      originalNameOverride: inlineOriginalName || undefined,
      fileTypeHint: fileTypeHint || undefined,
    };
  }

  const filePath = formData.get('file_path') as string | null;
  const fileType = formData.get('file_type') as string | null;
  const fileOriginalName = formData.get('file_original_name') as string | null;
  if (filePath && fileType) {
    return {
      kind: 'uploaded',
      path: filePath,
      fileType,
      originalName: fileOriginalName?.trim() || 'file',
    };
  }

  return null;
}

export async function applyMessageAttachment(
  insert: Record<string, unknown>,
  attachment: MessageAttachmentInput,
  userId: string,
): Promise<{ fileType: string }> {
  if (attachment.kind === 'file') {
    if (attachment.file.size > maxBytesForFile(attachment.file)) {
      throw new Error('Файл слишком большой');
    }
    const uploaded = await uploadMessageFile(userId, attachment.file);
    insert.file_path = uploaded.path;
    insert.file_type = attachment.fileTypeHint ?? uploaded.fileType;
    insert.file_original_name = attachment.originalNameOverride ?? uploaded.originalName;
    return { fileType: insert.file_type as string };
  }

  if (!isValidUserMessagePath(attachment.path, userId)) {
    throw new Error('Некорректный путь к файлу');
  }

  insert.file_path = attachment.path;
  insert.file_type = attachment.fileType;
  insert.file_original_name = attachment.originalName;
  return { fileType: attachment.fileType };
}
