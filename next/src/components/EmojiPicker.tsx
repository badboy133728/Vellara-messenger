'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { emojiCategories } from '@/lib/data/emojis';

export function EmojiPicker({
  anchorRef,
  onSelect,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState(emojiCategories[0].id);
  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
  const current = emojiCategories.find((c) => c.id === activeCategory);

  useEffect(() => {
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = 320;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setPosition({ left, bottom: window.innerHeight - rect.top + 8 });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef]);

  if (!position) return null;

  return createPortal(
    <div
      className="emoji-picker emoji-picker--portal"
      style={{ left: position.left, bottom: position.bottom }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="emoji-picker-header">
        <span className="emoji-picker-title">Смайлики</span>
        <button type="button" className="emoji-picker-close" title="Закрыть" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="emoji-tabs">
        {emojiCategories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`emoji-tab ${activeCategory === cat.id ? 'active' : ''}`}
            title={cat.label}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.icon}
          </button>
        ))}
      </div>
      <div className="emoji-grid">
        {(current?.emojis ?? []).map((emoji) => (
          <button key={emoji} type="button" className="emoji-item" onClick={() => onSelect(emoji)}>
            {emoji}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
