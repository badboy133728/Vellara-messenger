import { requireAuth } from '@/lib/auth';
import { publishUserCallSignaling } from '@/lib/realtime/publish';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ callId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const callId = Number((await params).callId);

  const { data: call } = await supabase.from('call_logs').select('*').eq('id', callId).single();
  if (!call || (call.caller_id !== user.id && call.receiver_id !== user.id)) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  if (!['ringing', 'active'].includes(call.status)) {
    return Response.json({ call });
  }

  const endedAt = new Date();
  const started = call.started_at ? new Date(call.started_at) : endedAt;
  const duration = Math.max(0, Math.floor((endedAt.getTime() - started.getTime()) / 1000));

  let status = 'completed';
  if (call.status === 'ringing' && call.receiver_id === user.id) status = 'rejected';
  else if (call.status === 'ringing') status = 'missed';

  const { data: updated } = await supabase
    .from('call_logs')
    .update({ status, ended_at: endedAt.toISOString(), duration })
    .eq('id', callId)
    .select('*')
    .single();

  const peerId = call.caller_id === user.id ? call.receiver_id : call.caller_id;
  await publishUserCallSignaling(peerId, {
    call_id: callId,
    signal: 'call:end',
    payload: { room_id: call.room_id, call: updated },
  });

  return Response.json({ call: updated });
}
