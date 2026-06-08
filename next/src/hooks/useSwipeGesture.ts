'use client';

import { useMemo, useRef } from 'react';
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
