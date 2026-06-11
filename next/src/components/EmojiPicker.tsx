'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { emojiCategories } from '@/lib/data/emojis';
import {
  defaultRecentEmojis,
  loadRecentEmojis,
  pushRecentEmoji,
} from '@/lib/recentEmojis';

const RECENT_ID = 'recent';

export function EmojiPicker({
  onSelect,
  isMobile = false,
}: {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  isMobile?: boolean;
}) {
  const [recent, setRecent] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState(RECENT_ID);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(loadRecentEmojis());
  }, []);

  useEffect(() => {
    gridRef.current?.scrollTo({ top: 0 });
  }, [activeCategory]);

  const categories = useMemo(
    () => [
      {
        id: RECENT_ID,
        label: 'Недавние',
        icon: '🕘',
        emojis: recent.length ? recent : defaultRecentEmojis,
      },
      ...emojiCategories,
    ],
    [recent],
  );

  const current = categories.find((c) => c.id === activeCategory) ?? categories[0];

  const handleSelect = (emoji: string) => {
    setRecent(pushRecentEmoji(emoji));
    onSelect(emoji);
  };

  return (
    <div
      className={`emoji-picker emoji-picker--docked${isMobile ? ' emoji-picker--mobile' : ''}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="emoji-picker__grid" ref={gridRef} role="listbox" aria-label="Смайлики">
        {current.emojis.map((emoji, index) => (
          <button
            key={`${activeCategory}-${emoji}-${index}`}
            type="button"
            className="emoji-item"
            role="option"
            aria-selected={false}
            aria-label={emoji}
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => e.preventDefault()}
            onClick={() => handleSelect(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="emoji-picker__tabs" role="tablist" aria-label="Категории смайликов">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={activeCategory === cat.id}
            className={`emoji-tab ${activeCategory === cat.id ? 'active' : ''}`}
            title={cat.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setActiveCategory(cat.id)}
          >
            {cat.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
