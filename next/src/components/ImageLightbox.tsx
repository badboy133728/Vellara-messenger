'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const max = Math.max(0, list.length - 1);
    setCurrent(Math.min(Math.max(0, index), max));
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
            setCurrent((c) => Math.max(0, c - 1));
          }}
        >
          ‹
        </button>
      )}

      <img
        key={list[current]}
        src={list[current]}
        alt={alt}
        className="lightbox__img"
        onClick={(e) => e.stopPropagation()}
      />

      {list.length > 1 && (
        <button
          type="button"
          className="lightbox__nav lightbox__nav--next"
          aria-label="Следующее"
          disabled={current === list.length - 1}
          onClick={(e) => {
            e.stopPropagation();
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
              key={url}
              type="button"
              className={`lightbox__thumb ${i === current ? 'lightbox__thumb--active' : ''}`}
              aria-label={`Фото ${i + 1}`}
              onClick={() => setCurrent(i)}
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
