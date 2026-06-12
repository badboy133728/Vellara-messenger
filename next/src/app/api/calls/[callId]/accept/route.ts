import { requireAuth } from '@/lib/auth';
import { publishUserCallSignaling } from '@/lib/realtime/publish';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ callId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const callId = Number((await params).callId);

  const { data: call } = await supabase.from('call_logs').select('*').eq('id', callId).single();
  if (!call || call.receiver_id !== user.id) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }
  if (call.status !== 'ringing') {
    return Response.json({ message: 'Звонок уже завершён' }, { status: 422 });
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  const { data: updated, error: updateError } = await admin
    .from('call_logs')
    .update({ status: 'active', started_at: call.started_at ?? now })
    .eq('id', callId)
    .eq('receiver_id', user.id)
    .eq('status', 'ringing')
    .select('*')
    .single();
  if (updateError || !updated) {
    return Response.json({ message: updateError?.message ?? 'Не удалось принять звонок' }, { status: 409 });
  }

  await publishUserCallSignaling(call.caller_id, {
    call_id: callId,
    signal: 'call:accepted',
    payload: { room_id: call.room_id, call: updated },
  });

  return Response.json({ call: updated });
}
