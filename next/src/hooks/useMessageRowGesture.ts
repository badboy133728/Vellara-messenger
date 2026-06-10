import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent, TouchEvent } from 'react';

type Point = { x: number; y: number };
type SwipeDirection = 'ltr' | 'rtl';

const RTL_REVEAL_MAX = 44;

type Options = {
  selectDelay?: number;
  swipeThreshold?: number;
  maxVerticalDrift?: number;
  moveSlop?: number;
  /** Свайп справа-налево — меню действий с сообщением. */
  onSwipeOpenActions: (event: { clientX: number; clientY: number }, payload: unknown) => void;
  /** Свайп слева-направо — сдвиг панели чата во время жеста. */
  onSwipeBackDrag?: (offset: number) => void;
  /** Свайп слева-направо — закрыть чат с анимацией. */
  onSwipeBack?: (swipeOffset: number) => void;
  onForwardSelectStart: (payload: unknown) => void;
};

export function useMessageRowGesture({
  selectDelay = 5000,
  swipeThreshold = 52,
  maxVerticalDrift = 36,
  moveSlop = 12,
  onSwipeOpenActions,
  onSwipeBackDrag,
  onSwipeBack,
  onForwardSelectStart,
}: Options) {
  const [swipeRowId, setSwipeRowId] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState<SwipeDirection | null>(null);
  const swipeOffsetRef = useRef(0);
  const swipeDirectionRef = useRef<SwipeDirection | null>(null);
  const ltrDragOffsetRef = useRef(0);

  const activeRef = useRef<{
    payload: unknown;
    rowId: number;
    start: Point;
    swiping: boolean;
    direction: SwipeDirection | null;
    selectTimer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  const onSwipeOpenActionsRef = useRef(onSwipeOpenActions);
  const onSwipeBackDragRef = useRef(onSwipeBackDrag);
  const onSwipeBackRef = useRef(onSwipeBack);
  onSwipeOpenActionsRef.current = onSwipeOpenActions;
  onSwipeBackDragRef.current = onSwipeBackDrag;
  onSwipeBackRef.current = onSwipeBack;

  const clearSelectTimer = () => {
    const active = activeRef.current;
    if (active?.selectTimer) {
      clearTimeout(active.selectTimer);
      active.selectTimer = null;
    }
  };

  const resetRtlVisual = useCallback(() => {
    swipeOffsetRef.current = 0;
    swipeDirectionRef.current = null;
    setSwipeRowId(null);
    setSwipeOffset(0);
    setSwipeDirection(null);
  }, []);

  const resetLtrDrag = useCallback(() => {
    if (ltrDragOffsetRef.current > 0) {
      ltrDragOffsetRef.current = 0;
      onSwipeBackDragRef.current?.(0);
    }
  }, []);

  const resetSwipeVisual = useCallback(() => {
    resetLtrDrag();
    resetRtlVisual();
  }, [resetLtrDrag, resetRtlVisual]);

  const finishGesture = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;

    clearSelectTimer();

    const direction = active.direction ?? swipeDirectionRef.current;

    if (active.swiping && direction === 'rtl' && swipeOffsetRef.current >= swipeThreshold) {
      onSwipeOpenActionsRef.current(
        { clientX: active.start.x, clientY: active.start.y },
        active.payload,
      );
      activeRef.current = null;
      resetRtlVisual();
      return;
    }

    if (active.swiping && direction === 'ltr') {
      const offset = ltrDragOffsetRef.current;
      activeRef.current = null;
      ltrDragOffsetRef.current = 0;
      resetRtlVisual();

      if (offset >= swipeThreshold) {
        onSwipeBackRef.current?.(offset);
      } else {
        onSwipeBackDragRef.current?.(0);
      }
      return;
    }

    activeRef.current = null;
    resetSwipeVisual();
  }, [resetRtlVisual, resetSwipeVisual, swipeThreshold]);

  const processTouchMove = useCallback(
    (touch: { clientX: number; clientY: number }, event?: { stopPropagation: () => void; preventDefault: () => void }) => {
      const active = activeRef.current;
      if (!active) return;
      const dx = touch.clientX - active.start.x;
      const dy = touch.clientY - active.start.y;

      if (!active.swiping) {
        if (Math.abs(dx) > moveSlop || Math.abs(dy) > moveSlop) {
          clearSelectTimer();
        }
        if (Math.abs(dy) > maxVerticalDrift && Math.abs(dy) > Math.abs(dx)) {
          if (Math.abs(dy) > moveSlop) {
            activeRef.current = null;
            resetSwipeVisual();
          }
          return;
        }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.05) return;

        active.swiping = true;
        active.direction = dx > 0 ? 'ltr' : 'rtl';
        swipeDirectionRef.current = active.direction;
        if (active.direction === 'rtl') {
          setSwipeDirection('rtl');
        }
        event?.stopPropagation();
      }

      if (!active.direction) return;

      event?.stopPropagation();
      event?.preventDefault();

      if (active.direction === 'ltr') {
        const magnitude = Math.max(0, dx);
        ltrDragOffsetRef.current = magnitude;
        onSwipeBackDragRef.current?.(magnitude);
        return;
      }

      const magnitude = Math.min(Math.abs(dx), RTL_REVEAL_MAX);
      swipeOffsetRef.current = magnitude;
      setSwipeRowId(active.rowId);
      setSwipeOffset(magnitude);
    },
    [maxVerticalDrift, moveSlop, resetSwipeVisual],
  );

  const onTouchStart = useCallback(
    (event: TouchEvent, payload: unknown, rowId: number) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      clearSelectTimer();
      resetSwipeVisual();
      activeRef.current = {
        payload,
        rowId,
        start: { x: touch.clientX, y: touch.clientY },
        swiping: false,
        direction: null,
        selectTimer: null,
      };

      activeRef.current.selectTimer = setTimeout(() => {
        const current = activeRef.current;
        if (!current || current.rowId !== rowId || current.swiping) return;
        current.selectTimer = null;
        if (typeof navigator.vibrate === 'function') navigator.vibrate(16);
        onForwardSelectStart(payload);
        activeRef.current = null;
        resetSwipeVisual();
      }, selectDelay);
    },
    [onForwardSelectStart, resetSwipeVisual, selectDelay],
  );

  const onTouchMove = useCallback(
    (event: TouchEvent) => {
      if (!activeRef.current || event.touches.length !== 1) return;
      processTouchMove(event.touches[0], event);
    },
    [processTouchMove],
  );

  const onTouchEnd = useCallback(
    (event: TouchEvent) => {
      if (!activeRef.current) return;
      if (activeRef.current.swiping) event.stopPropagation();
      finishGesture();
    },
    [finishGesture],
  );

  const onTouchCancel = useCallback(() => {
    clearSelectTimer();
    activeRef.current = null;
    resetSwipeVisual();
  }, [resetSwipeVisual]);

  const processTouchMoveRef = useRef(processTouchMove);
  processTouchMoveRef.current = processTouchMove;

  const attachMoveSurface = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const handler = (event: globalThis.TouchEvent) => {
      if (!activeRef.current || event.touches.length !== 1) return;
      processTouchMoveRef.current(event.touches[0]!, event);
    };
    node.addEventListener('touchmove', handler, { passive: false });
    return () => node.removeEventListener('touchmove', handler);
  }, []);

  useEffect(() => {
    const onGlobalEnd = () => finishGesture();
    window.addEventListener('touchend', onGlobalEnd, { passive: true });
    window.addEventListener('touchcancel', onGlobalEnd, { passive: true });
    return () => {
      window.removeEventListener('touchend', onGlobalEnd);
      window.removeEventListener('touchcancel', onGlobalEnd);
    };
  }, [finishGesture]);

  const onContextMenu = useCallback(
    (event: MouseEvent, payload: unknown) => {
      event.preventDefault();
      onForwardSelectStart(payload);
    },
    [onForwardSelectStart],
  );

  return {
    swipeRowId,
    swipeOffset,
    swipeDirection,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    attachMoveSurface,
    onContextMenu,
  };
};
