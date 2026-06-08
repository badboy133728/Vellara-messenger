import type { TouchEvent } from 'react';

export function useLongPress(
  onLongPress: (event: {
    clientX: number;
    clientY: number;
    payload: unknown;
  }) => void,
  { delay = 480, slop = 14 } = {},
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;

  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const onTouchStart = (event: TouchEvent, payload: unknown) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    clear();
    timer = setTimeout(() => {
      timer = null;
      if (typeof navigator.vibrate === 'function') navigator.vibrate(12);
      onLongPress({ clientX: startX, clientY: startY, payload });
    }, delay);
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!timer || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (Math.abs(touch.clientX - startX) > slop || Math.abs(touch.clientY - startY) > slop) {
      clear();
    }
  };

  const onTouchEnd = () => clear();
  const onTouchCancel = () => clear();

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
