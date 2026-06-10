'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties, TransitionEvent, TouchEvent } from 'react';

const SWIPE_CLOSE_MS = 420;
const SWIPE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

type SwipeOptions = {
  enabled?: boolean;
  threshold?: number;
  maxVerticalDrift?: number;
  edgeWidth?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeDown?: () => void;
};

export function useSwipeGesture({
  enabled = true,
  threshold = 56,
  maxVerticalDrift = 48,
  edgeWidth,
  onSwipeLeft,
  onSwipeRight,
  onSwipeDown,
}: SwipeOptions) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  return useMemo(() => {
    const onTouchStart = (event: TouchEvent) => {
      if (!enabled || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (edgeWidth != null && touch.clientX > edgeWidth) return;
      startRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!enabled || !startRef.current || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startRef.current.x;
      const dy = touch.clientY - startRef.current.y;
      if (Math.abs(dy) > maxVerticalDrift && Math.abs(dy) > Math.abs(dx)) {
        startRef.current = null;
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!enabled || !startRef.current) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - startRef.current.x;
      const dy = touch.clientY - startRef.current.y;
      startRef.current = null;

      if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) onSwipeRight?.();
        else onSwipeLeft?.();
        return;
      }

      if (Math.abs(dy) >= threshold && dy > 0 && Math.abs(dy) > Math.abs(dx)) {
        onSwipeDown?.();
      }
    };

    const onTouchCancel = () => {
      startRef.current = null;
    };

    return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
  }, [
    enabled,
    threshold,
    maxVerticalDrift,
    edgeWidth,
    onSwipeLeft,
    onSwipeRight,
    onSwipeDown,
  ]);
}

type DismissOptions = {
  enabled?: boolean;
  threshold?: number;
  onDismiss: () => void;
};

/** Vertical swipe-to-dismiss with live drag (bottom sheets). */
export function useSwipeDismiss({ enabled = true, threshold = 72, onDismiss }: DismissOptions) {
  const startY = useRef(0);
  const dragging = useRef(false);
  const nodeRef = useRef<HTMLElement | null>(null);

  const setOffset = (value: number) => {
    if (!nodeRef.current) return;
    nodeRef.current.style.transform = value > 0 ? `translateY(${value}px)` : '';
    nodeRef.current.style.transition = dragging.current ? 'none' : 'transform 0.22s ease';
  };

  const bindRef = (node: HTMLElement | null) => {
    nodeRef.current = node;
  };

  const handlers = useMemo(
    () => ({
      onTouchStart: (event: TouchEvent) => {
        if (!enabled || event.touches.length !== 1) return;
        dragging.current = true;
        startY.current = event.touches[0].clientY;
      },
      onTouchMove: (event: TouchEvent) => {
        if (!enabled || !dragging.current || event.touches.length !== 1) return;
        const dy = Math.max(0, event.touches[0].clientY - startY.current);
        setOffset(dy);
      },
      onTouchEnd: () => {
        if (!enabled || !dragging.current) return;
        dragging.current = false;
        const offset = nodeRef.current
          ? parseFloat(nodeRef.current.style.transform.replace(/[^\d.-]/g, '') || '0')
          : 0;
        if (offset >= threshold) {
          onDismiss();
        }
        setOffset(0);
      },
      onTouchCancel: () => {
        dragging.current = false;
        setOffset(0);
      },
    }),
    [enabled, threshold, onDismiss],
  );

  return { bindRef, handlers };
}

type SwipeBackOptions = {
  enabled?: boolean;
  threshold?: number;
  maxVerticalDrift?: number;
  onBack: () => void;
};

/** Horizontal swipe-back with live drag (chat / detail screens). */
export function useSwipeBack({
  enabled = true,
  threshold = 88,
  maxVerticalDrift = 42,
  onBack,
}: SwipeBackOptions) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const closingRef = useRef(false);
  const closeDoneRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const onBackRef = useRef(onBack);
  const offsetRef = useRef(0);
  const [panelOffset, setPanelOffset] = useState(0);
  const [panelAnimated, setPanelAnimated] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  onBackRef.current = onBack;

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const applyOffset = useCallback((value: number, animate: boolean) => {
    const max = typeof window !== 'undefined' ? window.innerWidth : value;
    const clamped = Math.max(0, Math.min(value, max));
    offsetRef.current = clamped;
    setPanelAnimated(animate);
    setPanelOffset(clamped);
  }, []);

  const completeClose = useCallback(() => {
    if (closeDoneRef.current) return;
    closeDoneRef.current = true;
    clearCloseTimer();
    onBackRef.current();
  }, [clearCloseTimer]);

  const reset = useCallback(() => {
    clearCloseTimer();
    closingRef.current = false;
    closeDoneRef.current = false;
    draggingRef.current = false;
    startRef.current = null;
    offsetRef.current = 0;
    setPanelOffset(0);
    setPanelAnimated(false);
    setIsDragging(false);
    setIsClosing(false);
  }, [clearCloseTimer]);

  const setDragOffset = useCallback(
    (value: number) => {
      if (!enabled || closingRef.current) return;
      const next = Math.max(0, value);
      draggingRef.current = next > 0;
      setIsDragging(next > 0);
      applyOffset(next, false);
    },
    [applyOffset, enabled],
  );

  const snapBack = useCallback(() => {
    if (!enabled || closingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    applyOffset(0, true);
  }, [applyOffset, enabled]);

  const animateBack = useCallback(
    (startOffset = 0) => {
      if (!enabled) {
        onBackRef.current();
        return;
      }
      if (closingRef.current) return;

      closingRef.current = true;
      setIsClosing(true);
      draggingRef.current = false;
      setIsDragging(false);
      startRef.current = null;

      const runClose = () => {
        applyOffset(typeof window !== 'undefined' ? window.innerWidth : startOffset, true);
        clearCloseTimer();
        closeTimerRef.current = window.setTimeout(completeClose, SWIPE_CLOSE_MS + 64);
      };

      if (startOffset > 8) {
        applyOffset(startOffset, false);
        requestAnimationFrame(() => requestAnimationFrame(runClose));
      } else {
        runClose();
      }
    },
    [applyOffset, clearCloseTimer, completeClose, enabled],
  );

  const onPanelTransitionEnd = useCallback(
    (event: TransitionEvent<HTMLElement>) => {
      if (!closingRef.current || event.propertyName !== 'transform') return;
      completeClose();
    },
    [completeClose],
  );

  const panelStyle = useMemo((): CSSProperties => {
    if (panelOffset <= 0 && !isClosing) return {};

    const max = typeof window !== 'undefined' ? window.innerWidth : 1;
    const progress = max > 0 ? panelOffset / max : 0;

    return {
      transform: panelOffset > 0 ? `translateX(${panelOffset}px)` : undefined,
      opacity: panelOffset > 0 ? 1 - progress * 0.28 : undefined,
      transition: panelAnimated
        ? `transform ${SWIPE_CLOSE_MS}ms ${SWIPE_EASING}, opacity ${SWIPE_CLOSE_MS}ms ${SWIPE_EASING}`
        : isDragging
          ? 'none'
          : undefined,
      ['--chat-swipe-progress' as string]: progress > 0 ? String(progress) : undefined,
    };
  }, [panelOffset, panelAnimated, isDragging, isClosing]);

  const handlers = useMemo(
    () => ({
      onTouchStart: (event: TouchEvent) => {
        if (!enabled || closingRef.current || event.touches.length !== 1) return;
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest(
            'button, a, input, textarea, select, label, .emoji-picker, .input-area, .msg-image-btn, .message-row',
          )
        ) {
          return;
        }
        const touch = event.touches[0];
        startRef.current = { x: touch.clientX, y: touch.clientY };
        draggingRef.current = false;
      },
      onTouchMove: (event: TouchEvent) => {
        if (!enabled || closingRef.current || !startRef.current || event.touches.length !== 1) return;
        const touch = event.touches[0];
        const dx = touch.clientX - startRef.current.x;
        const dy = touch.clientY - startRef.current.y;

        if (!draggingRef.current) {
          if (dx <= 0 || (Math.abs(dy) > maxVerticalDrift && Math.abs(dy) > Math.abs(dx))) {
            startRef.current = null;
            return;
          }
          if (dx < 10 || dx < Math.abs(dy) * 1.2) return;
          draggingRef.current = true;
          setIsDragging(true);
        }

        event.preventDefault();
        setDragOffset(dx);
      },
      onTouchEnd: () => {
        if (!enabled || closingRef.current || !startRef.current) return;
        startRef.current = null;
        if (!draggingRef.current) return;

        draggingRef.current = false;
        setIsDragging(false);
        const offset = offsetRef.current;

        if (offset >= threshold) {
          animateBack(offset);
          return;
        }

        snapBack();
      },
      onTouchCancel: () => {
        startRef.current = null;
        draggingRef.current = false;
        setIsDragging(false);
        snapBack();
      },
    }),
    [enabled, threshold, maxVerticalDrift, animateBack, setDragOffset, snapBack],
  );

  return {
    handlers,
    isDragging,
    isClosing,
    animateBack,
    setDragOffset,
    snapBack,
    reset,
    panelStyle,
    onPanelTransitionEnd,
  };
}
