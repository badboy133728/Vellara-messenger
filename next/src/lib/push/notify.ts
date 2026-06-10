import type { SupabaseClient } from '@supabase/supabase-js';
import { messagePreview } from '@/lib/chat/formatters';
import type { MessageRow } from '@/lib/types';
import { sendPushToUser } from '@/lib/push/send';

export async function notifyConversationPush(
  supabase: SupabaseClient,
  convId: number,
  senderId: string,
  senderName: string,
  message: MessageRow,
): Promise<void> {
  const { data: members } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', convId);

  const recipients = (members ?? [])
    .map((m) => m.user_id as string)
    .filter((id) => id !== senderId);

  if (recipients.length === 0) return;

  const { data: conv } = await supabase
    .from('conversations')
    .select('type, title')
    .eq('id', convId)
    .maybeSingle();

  let title = senderName.trim() || 'Vellara';
  if ((conv?.type === 'group' || conv?.type === 'channel') && conv.title) {
    title = conv.title;
  }

  const body =
    conv?.type === 'group'
      ? `${senderName}: ${messagePreview(message, senderId)}`
      : messagePreview(message, senderId);

  const url = `/main?chat=${convId}`;

  await Promise.all(
    recipients.map((userId) =>
      sendPushToUser(userId, {
        title,
        body,
        url,
        tag: `conv-${convId}`,
      }),
    ),
  );
}
