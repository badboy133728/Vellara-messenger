import { useCallback, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent, TouchEvent } from 'react';

type Point = { x: number; y: number };

type Options = {
  /** Long press duration for forward selection mode (ms). */
  selectDelay?: number;
  /** Horizontal swipe distance to open actions menu (px). */
  swipeThreshold?: number;
  maxVerticalDrift?: number;
  moveSlop?: number;
  onSwipeOpenActions: (event: { clientX: number; clientY: number }, payload: unknown) => void;
  onForwardSelectStart: (payload: unknown) => void;
};

export function useMessageRowGesture({
  selectDelay = 5000,
  swipeThreshold = 56,
  maxVerticalDrift = 40,
  moveSlop = 14,
  onSwipeOpenActions,
  onForwardSelectStart,
}: Options) {
  const [swipeRowId, setSwipeRowId] = useState<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeOffsetRef = useRef(0);

  const activeRef = useRef<{
    payload: unknown;
    rowId: number;
    start: Point;
    swiping: boolean;
    selectTimer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  const clearSelectTimer = () => {
    const active = activeRef.current;
    if (active?.selectTimer) {
      clearTimeout(active.selectTimer);
      active.selectTimer = null;
    }
  };

  const resetSwipeVisual = () => {
    swipeOffsetRef.current = 0;
    setSwipeRowId(null);
    setSwipeOffset(0);
  };

  const finishGesture = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;

    clearSelectTimer();

    if (active.swiping && swipeOffsetRef.current >= swipeThreshold) {
      onSwipeOpenActions({ clientX: active.start.x, clientY: active.start.y }, active.payload);
    }

    activeRef.current = null;
    resetSwipeVisual();
  }, [onSwipeOpenActions, swipeThreshold]);

  const onTouchStart = useCallback(
    (event: TouchEvent, payload: unknown, rowId: number) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      clearSelectTimer();
      activeRef.current = {
        payload,
        rowId,
        start: { x: touch.clientX, y: touch.clientY },
        swiping: false,
        selectTimer: null,
      };

      activeRef.current.selectTimer = setTimeout(() => {
        const current = activeRef.current;
        if (!current || current.rowId !== rowId) return;
        current.selectTimer = null;
        if (typeof navigator.vibrate === 'function') navigator.vibrate(16);
        onForwardSelectStart(payload);
        activeRef.current = null;
        resetSwipeVisual();
      }, selectDelay);
    },
    [onForwardSelectStart, selectDelay],
  );

  const onTouchMove = useCallback(
    (event: TouchEvent) => {
      const active = activeRef.current;
      if (!active || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - active.start.x;
      const dy = touch.clientY - active.start.y;

      if (!active.swiping) {
        if (Math.abs(dx) > moveSlop || Math.abs(dy) > moveSlop) {
          clearSelectTimer();
        }
        if (dx <= 0 || Math.abs(dy) > maxVerticalDrift && Math.abs(dy) > Math.abs(dx)) {
          if (Math.abs(dy) > moveSlop) activeRef.current = null;
          return;
        }
        if (dx < 10 || dx < Math.abs(dy) * 1.1) return;
        active.swiping = true;
        event.stopPropagation();
      }

      event.stopPropagation();
      event.preventDefault();
      const offset = Math.min(Math.max(0, dx), 120);
      swipeOffsetRef.current = offset;
      setSwipeRowId(active.rowId);
      setSwipeOffset(offset);
    },
    [maxVerticalDrift, moveSlop],
  );

  const onTouchEnd = useCallback(
    (event: TouchEvent) => {
      const active = activeRef.current;
      if (!active) return;
      if (active.swiping) event.stopPropagation();
      finishGesture();
    },
    [finishGesture],
  );

  const onTouchCancel = useCallback(() => {
    clearSelectTimer();
    activeRef.current = null;
    resetSwipeVisual();
  }, []);

  const startPointerGesture = useCallback(
    (clientX: number, clientY: number, payload: unknown, rowId: number) => {
      clearSelectTimer();
      activeRef.current = {
        payload,
        rowId,
        start: { x: clientX, y: clientY },
        swiping: false,
        selectTimer: null,
      };
    },
    [],
  );

  const movePointerGesture = useCallback(
    (event: PointerEvent) => {
      const active = activeRef.current;
      if (!active) return;
      const dx = event.clientX - active.start.x;
      const dy = event.clientY - active.start.y;

      if (!active.swiping) {
        if (dx <= 0 || (Math.abs(dy) > maxVerticalDrift && Math.abs(dy) > Math.abs(dx))) {
          if (Math.abs(dy) > moveSlop) activeRef.current = null;
          return;
        }
        if (dx < 10 || dx < Math.abs(dy) * 1.1) return;
        active.swiping = true;
        event.preventDefault();
      }

      event.preventDefault();
      const offset = Math.min(Math.max(0, dx), 120);
      swipeOffsetRef.current = offset;
      setSwipeRowId(active.rowId);
      setSwipeOffset(offset);
    },
    [maxVerticalDrift, moveSlop],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent, payload: unknown, rowId: number) => {
      if (event.pointerType === 'touch') return;
      if (event.button !== 0) return;
      startPointerGesture(event.clientX, event.clientY, payload, rowId);
    },
    [startPointerGesture],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      movePointerGesture(event);
    },
    [movePointerGesture],
  );

  const onPointerUp = useCallback(
    (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      finishGesture();
    },
    [finishGesture],
  );

  const onPointerCancel = useCallback(() => {
    clearSelectTimer();
    activeRef.current = null;
    resetSwipeVisual();
  }, []);

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
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu,
  };
}
