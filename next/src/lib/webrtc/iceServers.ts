export function buildIceServers(): RTCIceServer[] {
  if (process.env.WEBRTC_ICE_SERVERS) {
    try {
      const parsed = JSON.parse(process.env.WEBRTC_ICE_SERVERS) as RTCIceServer[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      /* use defaults below */
    }
  }

  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  const turnUrl = process.env.TURN_URL?.trim();
  const turnUser = process.env.TURN_USERNAME?.trim();
  const turnCred = process.env.TURN_CREDENTIAL?.trim();
  if (turnUrl && turnUser && turnCred) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
  }

  return servers;
}

export const DEFAULT_CLIENT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];
