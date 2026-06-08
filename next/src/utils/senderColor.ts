const PALETTE = [
  '#e879f9',
  '#38bdf8',
  '#4ade80',
  '#fbbf24',
  '#fb7185',
  '#a78bfa',
  '#2dd4bf',
  '#f97316',
];

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function senderColorForUserId(userId: string) {
  return PALETTE[hashString(userId) % PALETTE.length];
}

export function senderDisplayName(sender: { name?: string; last_name?: string } | null | undefined) {
  if (!sender) return 'Участник';
  const name = `${sender.name || ''} ${sender.last_name || ''}`.trim();
  return name || 'Участник';
}
