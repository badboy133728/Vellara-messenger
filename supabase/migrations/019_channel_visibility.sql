-- Публичность каналов:
-- public  -> виден в общем поиске каналов
-- private -> только по приглашению администратора
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;
