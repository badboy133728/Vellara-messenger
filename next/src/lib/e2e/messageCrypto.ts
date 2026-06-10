import {
  clearConversationKeyCacheForUser,
  getConversationKey,
  type ConversationKeyContext,
} from '@/lib/crypto/conversationKey';
import {
  containsE2EContent,
  decryptBlob,
  decryptFileName,
  decryptText,
  encryptBlob,
  encryptFileName,
  encryptText,
  isE2EContent,
  isE2EFileName,
  stripEmbeddedE2EContent,
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

async function decryptMessagesWithKey(
  key: CryptoKey,
  messages: FormattedMessage[],
): Promise<E2EDecryptedMessage[]> {
  const out: E2EDecryptedMessage[] = [];
  for (const m of messages) {
    const copy: E2EDecryptedMessage = { ...m };
    try {
      if (isE2EContent(m.content)) {
        copy.e2e_plaintext = await decryptText(key, m.content);
      } else if (containsE2EContent(m.content)) {
        const plainPart = stripEmbeddedE2EContent(m.content);
        copy.e2e_plaintext = plainPart || '🔒 Не удалось расшифровать';
        copy.e2e_failed = !plainPart;
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

  let out = await decryptMessagesWithKey(key, messages);
  const failed = out.some((m) => m.e2e_failed);
  if (failed) {
    clearConversationKeyCacheForUser(userId);
    try {
      const retryKey = await getConversationKey(userId, ctx);
      out = await decryptMessagesWithKey(retryKey, messages);
    } catch {
      /* keep first pass result */
    }
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

type PreviewMessage = Pick<
  FormattedMessage,
  | 'content'
  | 'file_type'
  | 'file_original_name'
  | 'message_type'
  | 'is_deleted'
  | 'e2e_plaintext'
  | 'e2e_file_name'
>;

/** Человекочитаемый превью-текст (уведомления, пересылка, список чатов). */
export function formatMessagePreviewText(msg: PreviewMessage, maxLen = 120): string {
  if (msg.is_deleted) return 'Сообщение удалено';
  if (msg.message_type === 'system') {
    const text = displayMessageContent(msg as FormattedMessage).trim();
    return text || 'Системное сообщение';
  }
  if (msg.file_type === 'voice') return 'Голосовое сообщение';
  if (msg.file_type === 'image') return 'Фото';
  if (msg.file_type === 'video') return 'Видео';
  if (msg.file_type === 'document') {
    const name = displayFileName(msg as FormattedMessage) || 'Файл';
    return name.length > maxLen ? `${name.slice(0, maxLen)}…` : name;
  }
  const text = displayMessageContent(msg as FormattedMessage).trim();
  if (!text) return 'Сообщение';
  if ((isE2EContent(msg.content) || containsE2EContent(msg.content)) && !msg.e2e_plaintext) {
    return '🔒 Сообщение';
  }
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
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
