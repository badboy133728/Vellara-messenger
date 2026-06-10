import { maxBytesForFile } from '@/lib/chat/attachmentTypes';
import { uploadMessageFile } from '@/lib/storage-server';

export type MessageAttachmentInput =
  | { kind: 'file'; file: File }
  | { kind: 'uploaded'; path: string; fileType: string; originalName: string };

export function isValidUserMessagePath(path: string, userId: string): boolean {
  const prefix = `messages/${userId}/`;
  return path.startsWith(prefix) && !path.includes('..');
}

export function getMessageAttachmentFromForm(formData: FormData): MessageAttachmentInput | null {
  const file = formData.get('file');
  if (file instanceof File && file.size > 0) {
    return { kind: 'file', file };
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
    insert.file_type = uploaded.fileType;
    insert.file_original_name = uploaded.originalName;
    return { fileType: uploaded.fileType };
  }

  if (!isValidUserMessagePath(attachment.path, userId)) {
    throw new Error('Некорректный путь к файлу');
  }

  insert.file_path = attachment.path;
  insert.file_type = attachment.fileType;
  insert.file_original_name = attachment.originalName;
  return { fileType: attachment.fileType };
}
