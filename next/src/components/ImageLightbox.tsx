'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function ImageLightbox({
  urls,
  index = 0,
  alt = 'Изображение',
  onClose,
}: {
  urls: string[];
  index?: number;
  alt?: string;
  onClose: () => void;
}) {
  const list = urls.filter(Boolean);
  const [current, setCurrent] = useState(index);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const dragRef = useRef<{ active: boolean; x: number; y: number; px: number; py: number } | null>(
    null,
  );

  useEffect(() => {
    const max = Math.max(0, list.length - 1);
    setCurrent(Math.min(Math.max(0, index), max));
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [list.length, index, urls]);

  useEffect(() => {
    if (!list.length) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setCurrent((c) => Math.max(0, c - 1));
      if (e.key === 'ArrowRight') setCurrent((c) => Math.min(list.length - 1, c + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [list.length, onClose]);

  const resetTransform = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setScale((s) => Math.min(4, Math.max(1, s + (e.deltaY < 0 ? 0.15 : -0.15))));
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (scale > 1) resetTransform();
    else setScale(2);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { active: true, x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag?.active) return;
    setPan({
      x: drag.px + (e.clientX - drag.x),
      y: drag.py + (e.clientY - drag.y),
    });
  };

  const onPointerUp = () => {
    if (dragRef.current) dragRef.current.active = false;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), scale };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    const ratio = dist / pinchRef.current.dist;
    setScale(Math.min(4, Math.max(1, pinchRef.current.scale * ratio)));
  };

  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  if (!list.length || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={list.length > 1 ? 'Просмотр альбома' : 'Просмотр изображения'}
      onClick={onClose}
    >
      <button type="button" className="lightbox__close" aria-label="Закрыть" onClick={onClose}>
        ✕
      </button>

      {list.length > 1 && (
        <div className="lightbox__counter">
          {current + 1} / {list.length}
        </div>
      )}

      {list.length > 1 && (
        <button
          type="button"
          className="lightbox__nav lightbox__nav--prev"
          aria-label="Предыдущее"
          disabled={current === 0}
          onClick={(e) => {
            e.stopPropagation();
            resetTransform();
            setCurrent((c) => Math.max(0, c - 1));
          }}
        >
          ‹
        </button>
      )}

      <div
        className="lightbox__stage"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <img
          key={list[current]}
          src={list[current]}
          alt={alt}
          className="lightbox__img"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
          draggable={false}
          onDoubleClick={onDoubleClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      {scale > 1 && (
        <button
          type="button"
          className="lightbox__reset-zoom"
          onClick={(e) => {
            e.stopPropagation();
            resetTransform();
          }}
        >
          Сбросить масштаб
        </button>
      )}

      {list.length > 1 && (
        <button
          type="button"
          className="lightbox__nav lightbox__nav--next"
          aria-label="Следующее"
          disabled={current === list.length - 1}
          onClick={(e) => {
            e.stopPropagation();
            resetTransform();
            setCurrent((c) => Math.min(list.length - 1, c + 1));
          }}
        >
          ›
        </button>
      )}

      {list.length > 1 && (
        <div className="lightbox__thumbs" onClick={(e) => e.stopPropagation()}>
          {list.map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              className={`lightbox__thumb ${i === current ? 'lightbox__thumb--active' : ''}`}
              aria-label={`Фото ${i + 1}`}
              onClick={() => {
                resetTransform();
                setCurrent(i);
              }}
            >
              <img src={url} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
