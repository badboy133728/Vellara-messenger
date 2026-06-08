import { requireAuth } from '@/lib/auth';

export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth && auth.error) return auth.error;

  let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  try {
    if (process.env.WEBRTC_ICE_SERVERS) {
      iceServers = JSON.parse(process.env.WEBRTC_ICE_SERVERS);
    }
  } catch {
    // default
  }

  return Response.json({ ice_servers: iceServers });
}
