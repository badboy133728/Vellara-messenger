'use client';

import { useMemo, useRef, useState } from 'react';
import type { TouchEvent } from 'react';

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
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const setOffset = (value: number, animate = false) => {
    if (!nodeRef.current) return;
    const clamped = Math.max(0, Math.min(value, window.innerWidth * 0.92));
    nodeRef.current.style.transform = clamped > 0 ? `translateX(${clamped}px)` : '';
    nodeRef.current.style.transition = animate
      ? 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)'
      : draggingRef.current
        ? 'none'
        : 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)';
  };

  const bindRef = (node: HTMLElement | null) => {
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
          if (dx <= 0 || Math.abs(dy) > maxVerticalDrift && Math.abs(dy) > Math.abs(dx)) {
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
        const offset = nodeRef.current
          ? parseFloat(nodeRef.current.style.transform.replace(/[^\d.-]/g, '') || '0')
          : 0;

        if (offset >= threshold) {
          closingRef.current = true;
          setIsClosing(true);
          setOffset(window.innerWidth, true);
          window.setTimeout(() => {
            onBack();
          }, 300);
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
    [enabled, threshold, maxVerticalDrift, onBack],
  );

  return { bindRef, handlers, isDragging, isClosing };
}
