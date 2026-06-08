import { requireAuth } from '@/lib/auth';
import { broadcastToUser } from '@/lib/realtime/broadcast';

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

  const now = new Date().toISOString();
  await supabase
    .from('call_logs')
    .update({ status: 'rejected', ended_at: now, duration: 0 })
    .eq('id', callId);

  await broadcastToUser(supabase, call.caller_id, 'CallSignaling', {
    call_id: callId,
    signal: 'call:reject',
    payload: { room_id: call.room_id },
  });

  return Response.json({ message: 'Отклонено' });
}
