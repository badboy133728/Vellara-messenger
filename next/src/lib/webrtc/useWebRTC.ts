import { api } from '@/lib/api';

let cachedIceServers: RTCIceServer[] | null = null;

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers) return cachedIceServers;
  try {
    const data = await api<{ ice_servers: RTCIceServer[] }>('/api/calls/ice-config');
    cachedIceServers = data.ice_servers?.length
      ? data.ice_servers
      : [{ urls: 'stun:stun.l.google.com:19302' }];
  } catch {
    cachedIceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
  }
  return cachedIceServers;
}

export type WebRTCManager = ReturnType<typeof createWebRTCManager>;

export function createWebRTCManager(onConnectionStateChange?: (state: string) => void) {
  let pc: RTCPeerConnection | null = null;
  let localStream: MediaStream | null = null;
  let remoteStream: MediaStream | null = null;
  let iceCallback: ((candidate: RTCIceCandidateInit) => void) | null = null;
  let iceServers: RTCIceServer[] | null = null;

  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());

  const ensureIce = async () => {
    if (!iceServers) iceServers = await fetchIceServers();
    return iceServers;
  };

  const stopLocalStream = () => {
    localStream?.getTracks().forEach((t) => t.stop());
    localStream = null;
    notify();
  };

  const closePeer = () => {
    pc?.close();
    pc = null;
    remoteStream = null;
    iceCallback = null;
    notify();
  };

  const cleanup = () => {
    stopLocalStream();
    closePeer();
  };

  const acquireMedia = async (video: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: video
        ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        : false,
    });
    localStream = stream;
    notify();
    return stream;
  };

  const createPeer = async (
    onRemoteTrack?: (stream: MediaStream) => void,
    onIce?: (candidate: RTCIceCandidateInit) => void,
  ) => {
    iceCallback = onIce ?? null;
    const servers = await ensureIce();
    const connection = new RTCPeerConnection({
      iceServers: servers,
      iceCandidatePoolSize: 10,
    });

    localStream?.getTracks().forEach((track) => {
      if (localStream) connection.addTrack(track, localStream);
    });

    connection.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (stream) {
        remoteStream = stream;
        onRemoteTrack?.(stream);
        notify();
      }
    };

    connection.onicecandidate = (ev) => {
      if (ev.candidate && iceCallback) {
        iceCallback(ev.candidate.toJSON());
      }
    };

    connection.onconnectionstatechange = () => {
      onConnectionStateChange?.(connection.connectionState);
    };

    connection.oniceconnectionstatechange = () => {
      if (connection.iceConnectionState === 'failed') {
        connection.restartIce?.();
      }
    };

    pc = connection;
    notify();
    return connection;
  };

  const sendSignal = async (callId: number, type: 'offer' | 'answer' | 'ice', payload: unknown) => {
    await api(`/api/calls/${callId}/signal`, {
      method: 'POST',
      body: JSON.stringify({ type, payload }),
    });
  };

  const bindIceToCall = (callId: number) => {
    iceCallback = (candidate) => {
      sendSignal(callId, 'ice', { candidate }).catch(() => {});
    };
  };

  const createOffer = async (callId: number) => {
    if (!pc) throw new Error('No peer connection');
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await pc.setLocalDescription(offer);
    await sendSignal(callId, 'offer', { sdp: pc.localDescription });
  };

  const handleOffer = async (callId: number, payload: { sdp: RTCSessionDescriptionInit }) => {
    if (!pc) throw new Error('No peer connection');
    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal(callId, 'answer', { sdp: pc.localDescription });
  };

  const handleAnswer = async (payload: { sdp: RTCSessionDescriptionInit }) => {
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  };

  const handleIce = async (payload: { candidate?: RTCIceCandidateInit }) => {
    if (!pc || !payload?.candidate) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
    } catch {
      /* stale */
    }
  };

  return {
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    hasPeer: () => !!pc,
    getLocalStream: () => localStream,
    getRemoteStream: () => remoteStream,
    acquireMedia,
    createPeer,
    bindIceToCall,
    createOffer,
    handleOffer,
    handleAnswer,
    handleIce,
    cleanup,
  };
}
