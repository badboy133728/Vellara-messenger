'use client';

import { useEffect, useRef, useState } from 'react';
import { formatVoiceDuration } from '@/utils/messagePreview';

export function VoiceMessagePlayer({
  src,
  duration = 0,
  isMine = false,
}: {
  src: string;
  duration?: number;
  isMine?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadedDuration, setLoadedDuration] = useState(0);

  const totalDuration = duration || loadedDuration || 0;
  const displayTime =
    isPlaying || currentTime > 0
      ? formatVoiceDuration(currentTime)
      : formatVoiceDuration(totalDuration);

  const pauseOthers = () => {
    document.querySelectorAll('.voice-player audio').forEach((el) => {
      if (el !== audioRef.current) (el as HTMLAudioElement).pause();
    });
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    pauseOthers();
    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  };

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio?.duration) return;
    setCurrentTime(Math.floor(audio.currentTime));
    setProgress((audio.currentTime / audio.duration) * 100);
  };

  const seek = (e: React.MouseEvent<HTMLButtonElement>) => {
    const audio = audioRef.current;
    const track = e.currentTarget;
    if (!audio?.duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = audio.duration * ratio;
    onTimeUpdate();
  };

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  return (
    <div className={`voice-player ${isMine ? 'mine' : ''}`}>
      <button type="button" className="play-btn" title={isPlaying ? 'Пауза' : 'Слушать'} onClick={togglePlay}>
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button type="button" className="voice-track" onClick={seek}>
        <span className="voice-progress" style={{ width: `${progress}%` }} />
      </button>
      <span className="voice-time">{displayTime}</span>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        onEnded={() => {
          setIsPlaying(false);
          setProgress(0);
          setCurrentTime(0);
          if (audioRef.current) audioRef.current.currentTime = 0;
        }}
        onLoadedMetadata={() => {
          if (audioRef.current?.duration && !duration) {
            setLoadedDuration(Math.floor(audioRef.current.duration));
          }
        }}
      />
    </div>
  );
}
