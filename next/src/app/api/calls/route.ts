import { requireAuth } from '@/lib/auth';
import { broadcastToUser } from '@/lib/realtime/broadcast';
import { v4 as uuidv4 } from 'uuid';

type PeerProfile = { name: string; last_name: string; avatar: string | null };

function formatCall(
  call: Record<string, unknown>,
  profiles: Map<string, PeerProfile>,
  viewerId: string,
) {
  const callerId = call.caller_id as string;
  const receiverId = call.receiver_id as string;
  const isOutgoing = callerId === viewerId;
  const peerId = isOutgoing ? receiverId : callerId;
  const peer = profiles.get(peerId);

  return {
    id: call.id,
    room_id: call.room_id,
    type: call.type,
    status: call.status,
    direction: isOutgoing ? 'outgoing' : 'incoming',
    duration: call.duration ?? 0,
    started_at: call.started_at,
    ended_at: call.ended_at,
    created_at: call.created_at,
    peer: peer
      ? { id: peerId, name: peer.name, last_name: peer.last_name, avatar: peer.avatar }
      : null,
  };
}

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, supabase } = auth;

  const { data: calls } = await supabase
    .from('call_logs')
    .select('*')
    .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .limit(80);

  const ids = new Set<string>();
  for (const c of calls ?? []) {
    ids.add(c.caller_id);
    ids.add(c.receiver_id);
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, last_name, avatar')
    .in('id', [...ids]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return Response.json(
    (calls ?? []).map((c) => formatCall(c, profileMap, user.id)),
  );
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;
  const { user, profile, supabase } = auth;

  const { receiver_id, type } = await request.json();
  if (!receiver_id || !['voice', 'video'].includes(type)) {
    return Response.json({ message: 'Некорректные данные' }, { status: 422 });
  }
  if (receiver_id === user.id) {
    return Response.json({ message: 'Нельзя позвонить себе' }, { status: 422 });
  }

  const { data: contact } = await supabase
    .from('user_contacts')
    .select('id')
    .eq('user_id', user.id)
    .eq('contact_id', receiver_id)
    .eq('status', 'accepted')
    .maybeSingle();

  if (!contact) {
    return Response.json({ message: 'Not in contacts' }, { status: 403 });
  }

  const roomId = uuidv4();
  const { data: call, error } = await supabase
    .from('call_logs')
    .insert({
      caller_id: user.id,
      receiver_id,
      room_id: roomId,
      type,
      status: 'ringing',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !call) {
    return Response.json({ message: error?.message }, { status: 500 });
  }

  const profileMap = new Map<string, PeerProfile>([
    [user.id, { name: profile.name, last_name: profile.last_name, avatar: profile.avatar }],
    [receiver_id, { name: '', last_name: '', avatar: null }],
  ]);
  const formatted = formatCall(call, profileMap, user.id);

  await broadcastToUser(supabase, receiver_id, 'CallSignaling', {
    call_id: call.id,
    signal: 'call:start',
    payload: {
      room_id: roomId,
      call: formatted,
      caller: {
        id: user.id,
        name: profile.name,
        last_name: profile.last_name,
        avatar: profile.avatar,
      },
      type,
    },
  });

  return Response.json({ call: formatted }, { status: 201 });
}
