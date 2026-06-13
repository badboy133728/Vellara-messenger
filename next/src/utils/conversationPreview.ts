import { isE2EContent, containsE2EContent, isE2EFileName } from '@/lib/crypto/message';
import type { ConversationKeyContext } from '@/lib/crypto/conversationKey';
import { decryptMessagesForConversation } from '@/lib/e2e/messageCrypto';
import type { ConversationListItem, FormattedMessage } from '@/lib/types';
import { conversationPreviewFromMessage } from '@/utils/conversationList';

type LastMessageSnapshot = {
  id: number;
  content?: string | null;
  user_id: string;
  created_at: string;
  file_path?: string | null;
  file_type?: string | null;
  file_original_name?: string | null;
  voice_duration?: number | null;
  album_group_id?: string | null;
  is_deleted?: boolean;
};

function readLastMessage(conv: ConversationListItem): LastMessageSnapshot | null {
  if (!conv.last_message || typeof conv.last_message !== 'object') return null;
  const raw = conv.last_message as LastMessageSnapshot;
  if (typeof raw.id !== 'number' || typeof raw.user_id !== 'string') return null;
  return raw;
}

function lastMessageNeedsDecryption(conv: ConversationListItem): boolean {
  const msg = readLastMessage(conv);
  if (!msg || conv.type === 'channel' || conv.type === 'saved') return false;
  if (msg.is_deleted) return false;
  if (msg.file_type === 'voice' || msg.file_type === 'image' || msg.file_type === 'video') {
    return isE2EFileName(msg.file_original_name);
  }
  const content = msg.content ?? '';
  return isE2EContent(content) || containsE2EContent(content);
}

export async function enrichConversationListPreviews(
  list: ConversationListItem[],
  userId: string,
  resolveCtx: (conv: ConversationListItem) => Promise<ConversationKeyContext | null>,
): Promise<ConversationListItem[]> {
  const targets = list.filter(lastMessageNeedsDecryption);
  if (!targets.length) {
    return list.map((conv) =>
      conv.type === 'channel' && readLastMessage(conv)
        ? {
            ...conv,
            last_message_preview: conversationPreviewFromMessage(
              readLastMessage(conv)! as FormattedMessage,
              userId,
              conv.type,
            ),
          }
        : conv,
    );
  }

  const previewByConvId = new Map<number, string>();

  await Promise.all(
    targets.map(async (conv) => {
      const ctx = await resolveCtx(conv);
      const msg = readLastMessage(conv);
      if (!ctx || !msg) return;

      const stub: FormattedMessage = {
        id: msg.id,
        message_type: 'user',
        content: msg.content ?? '',
        user_id: msg.user_id,
        created_at: msg.created_at,
        read_at: null,
        file_path: msg.file_path ?? null,
        file_type: msg.file_type ?? null,
        file_original_name: msg.file_original_name ?? null,
        voice_duration: msg.voice_duration ?? null,
        album_group_id: msg.album_group_id ?? null,
        reply_to_id: null,
        reply_to: null,
        forwarded_from_id: null,
        forwarded_from: null,
        is_edited: false,
        edited_at: null,
        is_deleted: msg.is_deleted ?? false,
        deleted_at: null,
        sender: null,
      };

      try {
        const [decrypted] = await decryptMessagesForConversation(userId, ctx, [stub]);
        if (!decrypted) return;
        previewByConvId.set(
          conv.id,
          conversationPreviewFromMessage(decrypted, userId, conv.type),
        );
      } catch {
        /* keep server placeholder */
      }
    }),
  );

  return list.map((conv) => {
    const decryptedPreview = previewByConvId.get(conv.id);
    if (decryptedPreview) {
      return { ...conv, last_message_preview: decryptedPreview };
    }
    if (conv.type === 'channel' && readLastMessage(conv)) {
      return {
        ...conv,
        last_message_preview: conversationPreviewFromMessage(
          readLastMessage(conv)! as FormattedMessage,
          userId,
          conv.type,
        ),
      };
    }
    return conv;
  });
}
