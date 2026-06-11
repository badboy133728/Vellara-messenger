import type { E2EFileTransform } from '@/lib/chat/messageFileUpload';
import type { ConversationKeyContext } from '@/lib/crypto/conversationKey';
import { encryptOutgoingBlob, encryptOutgoingFileName } from '@/lib/e2e/messageCrypto';

export function buildE2EFileTransform(
  userId: string,
  ctx: ConversationKeyContext,
): E2EFileTransform {
  return {
    encryptBlob: (blob) => encryptOutgoingBlob(userId, ctx, blob),
    encryptName: (name) => encryptOutgoingFileName(userId, ctx, name),
  };
}
