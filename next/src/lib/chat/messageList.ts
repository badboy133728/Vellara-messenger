import { formatMessage } from '@/lib/chat/formatters';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessageRow, Profile } from '@/lib/types';

export async function formatMessagesWithReplies(
  messages: MessageRow[],
  profileMap: Map<string, Profile>,
  admin: SupabaseClient,
): Promise<ReturnType<typeof formatMessage>[]> {
  const replyIds = [
    ...new Set(messages.map((m) => m.reply_to_id).filter((id): id is number => !!id)),
  ];
  const replyRows = new Map<number, MessageRow>();

  if (replyIds.length) {
    const { data: replies } = await admin.from('messages').select('*').in('id', replyIds);
    for (const row of replies ?? []) {
      replyRows.set(row.id, row as MessageRow);
    }
    const missingAuthors = [
      ...new Set([...replyRows.values()].map((r) => r.user_id)),
    ].filter((id) => !profileMap.has(id));
    if (missingAuthors.length) {
      const { data: extraProfiles } = await admin
        .from('profiles')
        .select('id, name, last_name, avatar')
        .in('id', missingAuthors);
      for (const p of extraProfiles ?? []) {
        profileMap.set(p.id, p as Profile);
      }
    }
  }

  return messages.map((m) =>
    formatMessage(m, profileMap.get(m.user_id) ?? null, false, replyRows, profileMap),
  );
}
