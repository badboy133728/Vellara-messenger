'use client';

import { useEffect, useState } from 'react';
import { formatLastSeenLabel, isOnline } from '@/lib/presence';

export function StatusDot({
  isOnline: isOnlineProp,
  lastSeenAt,
  showLabel = false,
}: {
  isOnline?: boolean;
  lastSeenAt?: string | null;
  showLabel?: boolean;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const online = isOnlineProp ?? isOnline(lastSeenAt);
  const label = online ? 'В сети' : formatLastSeenLabel(lastSeenAt);

  return (
    <span className="status-wrapper">
      <span className={`status-dot ${online ? 'online' : ''}`} />
      {showLabel && <span className="status-label">{label}</span>}
    </span>
  );
}
