-- Аватар для групп и каналов (путь в storage, bucket avatars)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS avatar text;
