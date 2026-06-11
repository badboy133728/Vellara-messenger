'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_DURATION_SEC = 300;

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const mimeTypeRef = useRef('audio/webm');

  const stopRecordingRef = useRef<() => Promise<{
    blob: Blob;
    duration: number;
    mimeType: string;
  } | null>>(async () => null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const getMimeType = () => {
    if (typeof MediaRecorder === 'undefined') return null;
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
  };

  const startRecording = useCallback(async () => {
    setError(null);
    const mimeType = getMimeType();
    if (!mimeType) {
      setError('Ваш браузер не поддерживает запись голоса');
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Запись недоступна (нужен HTTPS или localhost)');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeTypeRef.current = mimeType;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start(250);
      setIsRecording(true);
      startTimeRef.current = Date.now();
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setRecordingSeconds(sec);
        if (sec >= MAX_DURATION_SEC) {
          void stopRecordingRef.current();
        }
      }, 200);
      return true;
    } catch (e) {
      const err = e as { name?: string };
      setError(
        err.name === 'NotAllowedError'
          ? 'Разрешите доступ к микрофону в настройках браузера'
          : 'Не удалось начать запись',
      );
      cleanup();
      return false;
    }
  }, [cleanup]);

  const stopRecording = useCallback((): Promise<{
    blob: Blob;
    duration: number;
    mimeType: string;
  } | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        cleanup();
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || mimeTypeRef.current || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const duration = Math.max(
          1,
          Math.floor((Date.now() - startTimeRef.current) / 1000) || 1,
        );
        cleanup();
        resolve({ blob, duration, mimeType });
      };
      recorder.stop();
    });
  }, [cleanup]);

  stopRecordingRef.current = stopRecording;

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
    setRecordingSeconds(0);
  }, [cleanup]);

  return {
    isRecording,
    recordingSeconds,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
