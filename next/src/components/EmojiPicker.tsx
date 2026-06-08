'use client';

import { useState } from 'react';
import { emojiCategories } from '@/lib/data/emojis';

export function EmojiPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [activeCategory, setActiveCategory] = useState(emojiCategories[0].id);
  const current = emojiCategories.find((c) => c.id === activeCategory);

  return (
    <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
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
    </div>
  );
}
