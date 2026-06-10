import { requireAuth } from '@/lib/auth';
import { buildIceServers } from '@/lib/webrtc/iceServers';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;

  return Response.json({ ice_servers: buildIceServers() });
}
