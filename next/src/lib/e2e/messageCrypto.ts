import { getConversationKey, type ConversationKeyContext } from '@/lib/crypto/conversationKey';
import {
  decryptBlob,
  decryptFileName,
  decryptText,
  encryptBlob,
  encryptFileName,
  encryptText,
  isE2EContent,
  isE2EFileName,
} from '@/lib/crypto/message';
import { storageProxyUrl } from '@/lib/storage';
import type { FormattedMessage } from '@/lib/types';

export type E2EDecryptedMessage = FormattedMessage & {
  e2e_plaintext?: string;
  e2e_file_name?: string;
  e2e_failed?: boolean;
};

export function buildKeyContext(
  conversationId: number,
  conversationType: string,
  memberUserIds: string[],
  currentUserId: string,
  partnerUserId?: string | null,
): ConversationKeyContext {
  return {
    conversationId,
    conversationType,
    memberUserIds,
    partnerUserId: partnerUserId ?? memberUserIds.find((id) => id !== currentUserId) ?? null,
  };
}

export async function encryptOutgoingText(
  userId: string,
  ctx: ConversationKeyContext,
  text: string,
): Promise<string> {
  if (!text.trim()) return text;
  const key = await getConversationKey(userId, ctx);
  return encryptText(key, text);
}

export async function encryptOutgoingFileName(
  userId: string,
  ctx: ConversationKeyContext,
  name: string,
): Promise<string> {
  const key = await getConversationKey(userId, ctx);
  return encryptFileName(key, name);
}

export async function encryptOutgoingBlob(
  userId: string,
  ctx: ConversationKeyContext,
  blob: Blob,
): Promise<Blob> {
  const key = await getConversationKey(userId, ctx);
  return encryptBlob(key, blob);
}

export async function decryptMessagesForConversation(
  userId: string,
  ctx: ConversationKeyContext,
  messages: FormattedMessage[],
): Promise<E2EDecryptedMessage[]> {
  if (!messages.length) return [];

  let key: CryptoKey | null = null;
  let keyError = '';
  try {
    key = await getConversationKey(userId, ctx);
  } catch (err) {
    keyError = err instanceof Error ? err.message : 'Не удалось получить ключ';
    return messages.map((m) => ({
      ...m,
      e2e_failed: isE2EContent(m.content) || isE2EFileName(m.file_original_name),
      e2e_plaintext: isE2EContent(m.content) ? `🔒 ${keyError}` : m.content,
    }));
  }

  const out: E2EDecryptedMessage[] = [];
  for (const m of messages) {
    const copy: E2EDecryptedMessage = { ...m };
    try {
      if (isE2EContent(m.content)) {
        copy.e2e_plaintext = await decryptText(key, m.content);
      } else {
        copy.e2e_plaintext = m.content;
      }
      if (m.file_original_name && isE2EFileName(m.file_original_name)) {
        copy.e2e_file_name = await decryptFileName(key, m.file_original_name);
      } else {
        copy.e2e_file_name = m.file_original_name ?? undefined;
      }
      if (m.reply_to?.content && isE2EContent(m.reply_to.content)) {
        copy.reply_to = {
          ...m.reply_to,
          content: await decryptText(key, m.reply_to.content),
        };
      }
    } catch {
      copy.e2e_failed = true;
      copy.e2e_plaintext = isE2EContent(m.content) ? '🔒 Не удалось расшифровать' : m.content;
      copy.e2e_file_name = m.file_original_name ?? undefined;
    }
    out.push(copy);
  }
  return out;
}

export function displayMessageContent(m: E2EDecryptedMessage): string {
  if (m.is_deleted) return '';
  return m.e2e_plaintext ?? m.content;
}

export function displayFileName(m: E2EDecryptedMessage): string | null {
  return m.e2e_file_name ?? m.file_original_name;
}

export async function resolveDecryptedMediaUrl(
  userId: string,
  ctx: ConversationKeyContext,
  filePath: string | null | undefined,
  fileOriginalName: string | null | undefined,
  mimeHint?: string,
): Promise<string | null> {
  const proxy = storageProxyUrl(filePath);
  if (!proxy) return null;
  if (!isE2EFileName(fileOriginalName)) return proxy;
  const res = await fetch(proxy, { credentials: 'include' });
  if (!res.ok) return null;
  const key = await getConversationKey(userId, ctx);
  const plain = await decryptBlob(key, await res.blob(), mimeHint);
  return URL.createObjectURL(plain);
}

export function buildE2EContextFromConversation(
  conversationId: number,
  conversationType: string,
  memberUserIds: string[],
  currentUserId: string,
  partnerUserId?: string | null,
): ConversationKeyContext {
  return buildKeyContext(
    conversationId,
    conversationType,
    memberUserIds,
    currentUserId,
    partnerUserId,
  );
}
