import { requireAuth } from '@/lib/auth';
import { ensureMember } from '@/lib/chat/conversations';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const convId = Number((await params).conversationId);

  if (!(await ensureMember(supabase, convId, user.id))) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('conversation_key_envelopes')
    .select('envelope')
    .eq('conversation_id', convId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({ envelope: data?.envelope ?? null });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const convId = Number((await params).conversationId);

  if (!(await ensureMember(supabase, convId, user.id))) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    envelopes?: { user_id: string; envelope: string }[];
  };
  const envelopes = body.envelopes ?? [];
  if (!envelopes.length) {
    return Response.json({ message: 'Нет данных ключей' }, { status: 422 });
  }

  const { data: conv } = await supabase
    .from('conversations')
    .select('type')
    .eq('id', convId)
    .single();

  if (conv?.type !== 'group') {
    return Response.json({ message: 'Ключи беседы только для групп' }, { status: 422 });
  }

  const rows = envelopes
    .filter((e) => e.user_id && e.envelope)
    .map((e) => ({
      conversation_id: convId,
      user_id: e.user_id,
      envelope: e.envelope,
      key_version: 1,
      updated_at: new Date().toISOString(),
    }));

  const admin = createAdminClient();
  const { error } = await admin.from('conversation_key_envelopes').upsert(rows, {
    onConflict: 'conversation_id,user_id',
  });

  if (error) {
    return Response.json({ message: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, count: rows.length });
}
