import type { SupabaseClient } from '@supabase/supabase-js';
import { parseStoragePath } from '@/lib/storage';

const OPEN_BUCKETS = new Set(['avatars', 'backgrounds']);

function normalizeMessagesPath(storagePath: string): string | null {
  const parsed = parseStoragePath(storagePath);
  if (!parsed || parsed.bucket !== 'messages') return null;
  if (parsed.key.startsWith('_chunks/')) return null;
  return `messages/${parsed.key}`;
}

/** Доступ к файлу в Storage для авторизованного пользователя. */
export async function canAccessStoragePath(
  supabase: SupabaseClient,
  userId: string,
  storagePath: string,
): Promise<boolean> {
  const parsed = parseStoragePath(storagePath);
  if (!parsed) return false;

  if (OPEN_BUCKETS.has(parsed.bucket)) {
    return true;
  }

  if (parsed.bucket !== 'messages') {
    return false;
  }

  const filePath = normalizeMessagesPath(storagePath);
  if (!filePath) return false;

  const { data, error } = await supabase.rpc('can_read_message_file', {
    file_path: filePath,
    uid: userId,
  });

  if (error) {
    const { data: messages } = await supabase
      .from('messages')
      .select('conversation_id')
      .eq('file_path', filePath)
      .is('deleted_at', null)
      .limit(5);

    if (!messages?.length) return false;

    const convIds = [...new Set(messages.map((m) => m.conversation_id as number))];
    const { data: members } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', userId)
      .in('conversation_id', convIds);

    return (members?.length ?? 0) > 0;
  }

  return data === true;
}
