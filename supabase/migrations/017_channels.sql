-- Каналы (broadcast): подписчики смотрят, админ публикует, опционально комментарии-ответы.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS allow_comments boolean NOT NULL DEFAULT false;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN conversations.type IS 'private | group | saved | channel';
