'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { TouchEvent } from 'react';

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
  const nodeRef = useRef<HTMLElement | null>(null);
  const onBackRef = useRef(onBack);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  onBackRef.current = onBack;

  const readOffset = () => {
    if (!nodeRef.current) return 0;
    const match = nodeRef.current.style.transform.match(/translateX\(([-\d.]+)px\)/);
    return match ? parseFloat(match[1]) : 0;
  };

  const setOffset = useCallback((value: number, animate = false) => {
    const node = nodeRef.current;
    if (!node) return;

    const max = window.innerWidth;
    const clamped = Math.max(0, Math.min(value, max));
    const progress = max > 0 ? clamped / max : 0;

    node.style.transform = clamped > 0 ? `translateX(${clamped}px)` : '';
    node.style.opacity = clamped > 0 ? String(1 - progress * 0.28) : '';
    node.style.setProperty('--chat-swipe-progress', String(progress));

    const transition = animate
      ? `transform ${SWIPE_CLOSE_MS}ms ${SWIPE_EASING}, opacity ${SWIPE_CLOSE_MS}ms ${SWIPE_EASING}`
      : draggingRef.current
        ? 'none'
        : `transform ${SWIPE_CLOSE_MS}ms ${SWIPE_EASING}, opacity ${SWIPE_CLOSE_MS}ms ${SWIPE_EASING}`;
    node.style.transition = transition;
  }, []);

  const clearSwipeStyles = useCallback(() => {
    const node = nodeRef.current;
    if (!node) return;
    node.style.transform = '';
    node.style.opacity = '';
    node.style.transition = '';
    node.style.removeProperty('--chat-swipe-progress');
  }, []);

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

      const node = nodeRef.current;
      const finish = () => onBackRef.current();

      if (!node) {
        finish();
        return;
      }

      const runClose = () => {
        setOffset(window.innerWidth, true);

        let done = false;
        const complete = () => {
          if (done) return;
          done = true;
          node.removeEventListener('transitionend', onTransitionEnd);
          window.clearTimeout(fallback);
          finish();
        };

        const onTransitionEnd = (event: TransitionEvent) => {
          if (event.target !== node || event.propertyName !== 'transform') return;
          complete();
        };

        const fallback = window.setTimeout(complete, SWIPE_CLOSE_MS + 48);
        node.addEventListener('transitionend', onTransitionEnd);
      };

      if (startOffset > 8) {
        setOffset(startOffset, false);
        requestAnimationFrame(() => requestAnimationFrame(runClose));
      } else {
        runClose();
      }
    },
    [enabled, setOffset],
  );

  const bindRef = (node: HTMLElement | null) => {
    if (nodeRef.current && nodeRef.current !== node) {
      clearSwipeStyles();
    }
    nodeRef.current = node;
  };

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
        if (!enabled || !startRef.current || event.touches.length !== 1) return;
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
        setOffset(dx);
      },
      onTouchEnd: () => {
        if (!enabled || !startRef.current) return;
        startRef.current = null;
        if (!draggingRef.current) return;

        draggingRef.current = false;
        setIsDragging(false);
        const offset = readOffset();

        if (offset >= threshold) {
          animateBack(offset);
          return;
        }

        setOffset(0, true);
      },
      onTouchCancel: () => {
        startRef.current = null;
        draggingRef.current = false;
        setIsDragging(false);
        setOffset(0, true);
      },
    }),
    [enabled, threshold, maxVerticalDrift, animateBack, setOffset],
  );

  return { bindRef, handlers, isDragging, isClosing, animateBack };
}
