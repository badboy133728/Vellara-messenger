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
  const forwardIds = [
    ...new Set(messages.map((m) => m.forwarded_from_id).filter((id): id is number => !!id)),
  ];
  const replyRows = new Map<number, MessageRow>();
  const forwardRows = new Map<number, MessageRow>();

  const lookupIds = [...new Set([...replyIds, ...forwardIds])];
  if (lookupIds.length) {
    const { data: related } = await admin.from('messages').select('*').in('id', lookupIds);
    for (const row of related ?? []) {
      const typed = row as MessageRow;
      if (replyIds.includes(typed.id)) replyRows.set(typed.id, typed);
      if (forwardIds.includes(typed.id)) forwardRows.set(typed.id, typed);
    }
    const missingAuthors = [
      ...new Set([...replyRows.values(), ...forwardRows.values()].map((r) => r.user_id)),
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
    formatMessage(m, profileMap.get(m.user_id) ?? null, false, replyRows, profileMap, forwardRows),
  );
}
