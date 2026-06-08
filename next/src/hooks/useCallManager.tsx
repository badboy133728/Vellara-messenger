'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import { createWebRTCManager } from '@/lib/webrtc/useWebRTC';

export type CallPhase = 'idle' | 'incoming' | 'outgoing' | 'active' | 'ending';

export type CallPeer = {
  id: string;
  name: string;
  last_name: string;
  avatar?: string | null;
};

export type IncomingCall = {
  call_id: number;
  room_id?: string;
  type: 'voice' | 'video';
  caller?: CallPeer;
  call?: { id: number; peer?: CallPeer | null; room_id?: string };
};

export type ActiveCall = {
  id: number;
  room_id?: string;
  type?: string;
  peer?: CallPeer | null;
};

type CallState = {
  mode: 'voice' | 'video' | null;
  call: ActiveCall | null;
  incoming: IncomingCall | null;
  phase: CallPhase;
  connectionState: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  videoEnabled: boolean;
  error: string | null;
  roomId: string | null;
};

const initialState: CallState = {
  mode: null,
  call: null,
  incoming: null,
  phase: 'idle',
  connectionState: 'idle',
  localStream: null,
  remoteStream: null,
  muted: false,
  videoEnabled: true,
  error: null,
  roomId: null,
};

let ringTimer: ReturnType<typeof setInterval> | null = null;
let ringCtx: AudioContext | null = null;

function startRinging() {
  stopRinging();
  try {
    ringCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const beep = () => {
      if (!ringCtx) return;
      const osc = ringCtx.createOscillator();
      const gain = ringCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 480;
      gain.gain.value = 0.12;
      osc.connect(gain);
      gain.connect(ringCtx.destination);
      osc.start();
      osc.stop(ringCtx.currentTime + 0.35);
    };
    beep();
    ringTimer = setInterval(beep, 1400);
  } catch {
    /* no audio */
  }
}

export function stopRinging() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
  if (ringCtx) {
    ringCtx.close().catch(() => {});
    ringCtx = null;
  }
}

function normalizeSignal(signal: string) {
  const map: Record<string, string> = {
    incoming: 'call:start',
    accepted: 'call:accepted',
    rejected: 'call:reject',
    ended: 'call:end',
    offer: 'call:offer',
    answer: 'call:answer',
    ice: 'call:ice-candidate',
  };
  return map[signal] || signal;
}

export function isContactId(contactIds: Set<string> | string[], userId: string) {
  if (contactIds instanceof Set) return contactIds.has(userId);
  return (contactIds || []).some((id) => id === userId);
}

type CallContextValue = CallState & {
  activeCallPeer: CallPeer | null;
  activeCallScreenVisible: boolean;
  startCall: (receiverId: string, type?: 'voice' | 'video', contactIds?: Set<string> | string[]) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  rejectIncoming: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  handleCallSignaling: (data: unknown) => Promise<void>;
  loadContactIds: () => Promise<Set<string>>;
};

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [state, setState] = useState<CallState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const rtcRef = useRef(createWebRTCManager((connState) => {
    if (connState === 'connected') {
      setState((s) => ({ ...s, connectionState: 'connected', phase: 'active' }));
    } else if (connState === 'connecting') {
      setState((s) => ({ ...s, connectionState: 'connecting' }));
    } else if (connState === 'failed' || connState === 'disconnected') {
      setState((s) => ({ ...s, connectionState: connState }));
    }
  }));

  const syncStreams = useCallback(() => {
    const rtc = rtcRef.current;
    setState((s) => ({
      ...s,
      localStream: rtc.getLocalStream(),
      remoteStream: rtc.getRemoteStream(),
    }));
  }, []);

  useEffect(() => {
    const unsub = rtcRef.current.subscribe(syncStreams);
    return unsub;
  }, [syncStreams]);

  const resetCallState = useCallback(() => {
    setState(initialState);
  }, []);

  const setupCallerPeer = useCallback(
    async (callId: number) => {
      const rtc = rtcRef.current;
      await rtc.createPeer(() => syncStreams(), (candidate) => {
        api(`/api/calls/${callId}/signal`, {
          method: 'POST',
          body: JSON.stringify({ type: 'ice', payload: { candidate } }),
        }).catch(() => {});
      });
      rtc.bindIceToCall(callId);
      await rtc.createOffer(callId);
      setState((s) => ({ ...s, connectionState: 'connecting' }));
    },
    [syncStreams],
  );

  const loadContactIds = useCallback(async () => {
    const data = await api<{ id: string }[]>('/api/contacts/my');
    return new Set(data.map((c) => c.id));
  }, []);

  const startCall = useCallback(
    async (receiverId: string, type: 'voice' | 'video' = 'voice', contactIds?: Set<string> | string[]) => {
      if (contactIds && !isContactId(contactIds, receiverId)) {
        throw new Error('CONTACTS_ONLY');
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('NO_MEDIA');
      }

      resetCallState();
      setState((s) => ({
        ...s,
        mode: type,
        phase: 'outgoing',
        connectionState: 'connecting',
      }));

      const rtc = rtcRef.current;
      try {
        const res = await api<{ call: ActiveCall & { room_id?: string } }>('/api/calls', {
          method: 'POST',
          body: JSON.stringify({ receiver_id: receiverId, type }),
        });
        setState((s) => ({
          ...s,
          call: res.call,
          roomId: res.call?.room_id ?? null,
        }));
        await rtc.acquireMedia(type === 'video');
        syncStreams();
        setState((s) => ({ ...s, videoEnabled: type === 'video' }));
      } catch (e) {
        resetCallState();
        rtc.cleanup();
        throw e;
      }
    },
    [resetCallState, syncStreams],
  );

  const endCallInner = useCallback(async () => {
    stopRinging();
    const callId = stateRef.current.call?.id || stateRef.current.incoming?.call_id;
    setState((s) => ({ ...s, phase: 'ending', connectionState: 'ended' }));
    if (callId) {
      try {
        await api(`/api/calls/${callId}/end`, { method: 'POST' });
      } catch {
        /* ignore */
      }
    }
    rtcRef.current.cleanup();
    resetCallState();
  }, [resetCallState]);

  const acceptIncoming = useCallback(async () => {
    stopRinging();
    const incoming = stateRef.current.incoming;
    if (!incoming?.call_id) return;

    const callId = incoming.call_id;
    const type = incoming.type || 'voice';
    const rtc = rtcRef.current;

    try {
      await rtc.acquireMedia(type === 'video');
      syncStreams();
      setState((s) => ({ ...s, videoEnabled: type === 'video' }));

      const res = await api<{ call: ActiveCall }>(`/api/calls/${callId}/accept`, { method: 'POST' });
      setState((s) => ({
        ...s,
        call: res.call,
        roomId: res.call?.room_id ?? s.roomId,
        incoming: null,
        mode: type,
        phase: 'active',
        connectionState: 'connecting',
      }));

      await rtc.createPeer(() => syncStreams(), (candidate) => {
        api(`/api/calls/${callId}/signal`, {
          method: 'POST',
          body: JSON.stringify({ type: 'ice', payload: { candidate } }),
        }).catch(() => {});
      });
      rtc.bindIceToCall(callId);
    } catch (e) {
      setState((s) => ({
        ...s,
        error: e instanceof Error ? e.message : 'Не удалось принять звонок',
      }));
      await endCallInner();
      throw e;
    }
  }, [syncStreams, endCallInner]);

  const rejectIncoming = useCallback(async () => {
    stopRinging();
    const callId = stateRef.current.incoming?.call_id;
    if (callId) {
      try {
        await api(`/api/calls/${callId}/reject`, { method: 'POST' });
      } catch {
        /* ignore */
      }
    }
    rtcRef.current.cleanup();
    resetCallState();
  }, [resetCallState]);

  const endCall = endCallInner;

  const handleCallSignaling = useCallback(
    async (data: unknown) => {
      const { call_id: callId, signal: rawSignal, payload } = (data || {}) as {
        call_id?: number;
        signal?: string;
        payload?: Record<string, unknown>;
      };
      if (!callId) return;

      const signal = normalizeSignal(rawSignal || '');
      const myId = userId;
      const rtc = rtcRef.current;
      const current = stateRef.current;

      if (signal === 'call:start') {
        if (current.phase !== 'idle') return;
        const p = payload as IncomingCall & { room_id?: string; type?: 'voice' | 'video'; caller?: CallPeer; call?: ActiveCall };
        setState((s) => ({
          ...s,
          incoming: {
            call_id: callId,
            room_id: p?.room_id,
            type: p?.type || 'voice',
            caller: p?.caller,
            call: p?.call as IncomingCall['call'],
          },
          roomId: (p?.room_id as string) ?? null,
          phase: 'incoming',
          connectionState: 'ringing',
        }));
        startRinging();
        return;
      }

      if (
        signal === 'call:accepted' &&
        current.phase === 'outgoing' &&
        String(current.call?.id) === String(callId)
      ) {
        await setupCallerPeer(callId);
        return;
      }

      if (signal === 'call:reject' || signal === 'call:end') {
        stopRinging();
        if (
          String(current.call?.id) === String(callId) ||
          String(current.incoming?.call_id) === String(callId)
        ) {
          rtc.cleanup();
          resetCallState();
        }
        return;
      }

      const fromUserId = (payload as { from_user_id?: string })?.from_user_id;
      const innerPayload = (payload as { payload?: Record<string, unknown> })?.payload;

      if (signal === 'call:offer' && fromUserId !== myId) {
        if (!rtc.hasPeer()) {
          const type = current.mode || current.incoming?.type || 'voice';
          await rtc.acquireMedia(type === 'video');
          syncStreams();
          await rtc.createPeer(() => syncStreams(), (candidate) => {
            api(`/api/calls/${callId}/signal`, {
              method: 'POST',
              body: JSON.stringify({ type: 'ice', payload: { candidate } }),
            }).catch(() => {});
          });
          rtc.bindIceToCall(callId);
        }
        await rtc.handleOffer(callId, innerPayload as { sdp: RTCSessionDescriptionInit });
        return;
      }

      if (signal === 'call:answer' && fromUserId !== myId) {
        await rtc.handleAnswer(innerPayload as { sdp: RTCSessionDescriptionInit });
        setState((s) => ({ ...s, phase: 'active', connectionState: 'connected' }));
        syncStreams();
        return;
      }

      if (signal === 'call:ice-candidate' && fromUserId !== myId) {
        await rtc.handleIce(innerPayload as { candidate?: RTCIceCandidateInit });
      }
    },
    [userId, resetCallState, setupCallerPeer, syncStreams],
  );

  const toggleMute = useCallback(() => {
    const audio = rtcRef.current.getLocalStream()?.getAudioTracks()[0];
    if (!audio) return;
    audio.enabled = !audio.enabled;
    setState((s) => ({ ...s, muted: !audio.enabled }));
  }, []);

  const toggleVideo = useCallback(() => {
    const video = rtcRef.current.getLocalStream()?.getVideoTracks()[0];
    if (!video) return;
    video.enabled = !video.enabled;
    setState((s) => ({ ...s, videoEnabled: video.enabled }));
  }, []);

  const activeCallPeer = useMemo(() => {
    if (state.incoming?.caller) return state.incoming.caller;
    return state.call?.peer ?? null;
  }, [state.incoming, state.call]);

  const activeCallScreenVisible = ['outgoing', 'active', 'ending'].includes(state.phase);

  const value = useMemo<CallContextValue>(
    () => ({
      ...state,
      activeCallPeer,
      activeCallScreenVisible,
      startCall,
      acceptIncoming,
      rejectIncoming,
      endCall,
      toggleMute,
      toggleVideo,
      handleCallSignaling,
      loadContactIds,
    }),
    [
      state,
      activeCallPeer,
      activeCallScreenVisible,
      startCall,
      acceptIncoming,
      rejectIncoming,
      endCall,
      toggleMute,
      toggleVideo,
      handleCallSignaling,
      loadContactIds,
    ],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
