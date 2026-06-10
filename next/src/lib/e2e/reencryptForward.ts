import { uploadBlobInChunks } from '@/lib/chat/chunkedUploadClient';
import { mimeHintForMessageFile } from '@/lib/chat/attachmentTypes';
import type { ConversationKeyContext } from '@/lib/crypto/conversationKey';
import { getConversationKey } from '@/lib/crypto/conversationKey';
import {
  decryptBlob,
  encryptBlob,
  encryptFileName,
  isE2EContent,
  isE2EFileName,
} from '@/lib/crypto/message';
import {
  displayMessageContent,
  encryptOutgoingText,
} from '@/lib/e2e/messageCrypto';
import { storageProxyUrl } from '@/lib/storage';
import type { FormattedMessage } from '@/lib/types';

export type ForwardReencryptUpdate = {
  message_id: number;
  content: string;
  file_original_name?: string;
  file_path?: string;
};

function needsTargetEncryption(
  source: FormattedMessage,
  targetCtx: ConversationKeyContext | null,
): boolean {
  if (!targetCtx) return false;
  if (isE2EContent(source.content) || isE2EFileName(source.file_original_name)) return true;
  if (targetCtx.conversationType === 'group') return true;
  return Boolean(source.content?.trim() || source.file_path);
}

async function reencryptAttachment(
  userId: string,
  filePath: string,
  fileOriginalName: string | null | undefined,
  plainName: string,
  sourceCtx: ConversationKeyContext,
  targetCtx: ConversationKeyContext,
  mimeHint?: string,
): Promise<{ path: string; originalName: string }> {
  const proxy = storageProxyUrl(filePath);
  if (!proxy) throw new Error('Некорректный путь к файлу');

  const res = await fetch(proxy, { credentials: 'include' });
  if (!res.ok) throw new Error('Не удалось загрузить вложение');

  let blob = await res.blob();
  const encrypted =
    isE2EFileName(fileOriginalName) || filePath.endsWith('.e2e');
  if (encrypted) {
    const sourceKey = await getConversationKey(userId, sourceCtx);
    blob = await decryptBlob(sourceKey, blob, mimeHint);
  }

  const targetKey = await getConversationKey(userId, targetCtx);
  const outBlob = await encryptBlob(targetKey, blob);
  const encName = await encryptFileName(targetKey, plainName);
  const uploaded = await uploadBlobInChunks(outBlob, 'encrypted.e2e', 'application/octet-stream');
  return { path: uploaded.path, originalName: encName };
}

export async function buildForwardReencryptUpdates(
  userId: string,
  sources: FormattedMessage[],
  sourceCtx: ConversationKeyContext,
  forwarded: FormattedMessage[],
  caption: string,
  resolveTargetCtx: (convId: number) => Promise<ConversationKeyContext | null>,
): Promise<ForwardReencryptUpdate[]> {
  const sourceById = new Map(sources.map((m) => [m.id, m]));
  const firstSourceId = sources[0]?.id;
  const trimmedCaption = caption.trim();
  const updates: ForwardReencryptUpdate[] = [];

  for (const fwd of forwarded) {
    const sourceId = fwd.forwarded_from_id;
    if (!sourceId || !fwd.conversation_id) continue;

    const source = sourceById.get(sourceId);
    if (!source) continue;

    const targetCtx = await resolveTargetCtx(fwd.conversation_id);
    if (!needsTargetEncryption(source, targetCtx)) continue;

    let plaintext = displayMessageContent(source).trim();
    if (trimmedCaption && sourceId === firstSourceId) {
      plaintext = plaintext ? `${trimmedCaption}\n\n${plaintext}` : trimmedCaption;
    }

    const update: ForwardReencryptUpdate = {
      message_id: fwd.id,
      content: targetCtx
        ? await encryptOutgoingText(userId, targetCtx, plaintext)
        : plaintext,
    };

    if (fwd.file_path && targetCtx) {
      const plainName =
        source.e2e_file_name ??
        (source.file_original_name && !isE2EFileName(source.file_original_name)
          ? source.file_original_name
          : 'file');
      const refiled = await reencryptAttachment(
        userId,
        fwd.file_path,
        fwd.file_original_name,
        plainName,
        sourceCtx,
        targetCtx,
        mimeHintForMessageFile(source),
      );
      update.file_path = refiled.path;
      update.file_original_name = refiled.originalName;
    }

    updates.push(update);
  }

  return updates;
}
