'use client';

import { useEffect, useRef } from 'react';
import { ContactAvatar } from '@/components/ContactAvatar';
import { useCall } from '@/hooks/useCallManager';

export function CallScreen({
  phase,
  peer,
  isVideo,
  onAccept,
  onReject,
  onHangup,
}: {
  phase: string;
  peer: { name?: string; last_name?: string; avatar?: string | null } | null;
  isVideo: boolean;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
}) {
  const { localStream, remoteStream, muted, videoEnabled, connectionState, toggleMute, toggleVideo } =
    useCall();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const peerName = peer
    ? `${peer.name || ''} ${peer.last_name || ''}`.trim() || 'Контакт'
    : 'Звонок';

  const statusLabel = (() => {
    if (phase === 'outgoing') return 'Вызов…';
    if (connectionState === 'connecting') return 'Соединение…';
    if (connectionState === 'connected' || phase === 'active') return 'На связи';
    if (phase === 'ending') return 'Завершение…';
    return 'Ожидание…';
  })();

  return (
    <div className={`call-screen ${isVideo ? 'call-screen--video' : ''}`}>
      {remoteStream ? (
        <video ref={remoteVideoRef} className="call-screen__remote" autoPlay playsInline />
      ) : (
        <div className="call-screen__placeholder">
          <ContactAvatar
            name={peer?.name}
            lastName={peer?.last_name}
            avatar={peer?.avatar}
            size="lg"
          />
          <h2>{peerName}</h2>
          <p className="call-screen__status">{statusLabel}</p>
        </div>
      )}

      {isVideo && localStream && (
        <video
          ref={localVideoRef}
          className="call-screen__local"
          autoPlay
          playsInline
          muted
        />
      )}

      <div className="call-screen__controls">
        <button
          type="button"
          className={`call-ctrl ${muted ? 'active' : ''}`}
          onClick={toggleMute}
        >
          {muted ? '🔇' : '🎤'}
        </button>
        {isVideo && (
          <button
            type="button"
            className={`call-ctrl ${!videoEnabled ? 'active' : ''}`}
            onClick={toggleVideo}
          >
            {videoEnabled ? '📹' : '🚫'}
          </button>
        )}
        {phase === 'incoming' ? (
          <>
            <button type="button" className="call-ctrl call-ctrl--accept" onClick={onAccept}>
              ✓
            </button>
            <button type="button" className="call-ctrl call-ctrl--reject" onClick={onReject}>
              ✕
            </button>
          </>
        ) : (
          <button type="button" className="call-ctrl call-ctrl--hangup" onClick={onHangup}>
            📞
          </button>
        )}
      </div>
    </div>
  );
}
