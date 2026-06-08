import { requireAuth } from '@/lib/auth';
import { broadcastToUser } from '@/lib/realtime/broadcast';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ callId: string }> },
) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;
  const callId = Number((await params).callId);

  const { type, payload } = await request.json();
  if (!['offer', 'answer', 'ice'].includes(type) || !payload) {
    return Response.json({ message: 'Некорректные данные' }, { status: 422 });
  }

  const { data: call } = await supabase.from('call_logs').select('*').eq('id', callId).single();
  if (!call || (call.caller_id !== user.id && call.receiver_id !== user.id)) {
    return Response.json({ message: 'Нет доступа' }, { status: 403 });
  }

  if (['rejected', 'missed', 'completed'].includes(call.status)) {
    return Response.json({ message: 'Звонок завершён' }, { status: 422 });
  }

  const signalType = type === 'offer' ? 'call:offer' : type === 'answer' ? 'call:answer' : 'call:ice-candidate';
  const peerId = call.caller_id === user.id ? call.receiver_id : call.caller_id;

  await broadcastToUser(supabase, peerId, 'CallSignaling', {
    call_id: callId,
    signal: signalType,
    payload: { room_id: call.room_id, from_user_id: user.id, payload },
  });

  return Response.json({ ok: true });
}
