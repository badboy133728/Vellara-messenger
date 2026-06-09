-- Личное «Избранное»: conversations.type = 'saved', один участник.
-- Применять не обязательно — тип text без enum. Документирует формат для новых записей.

comment on column public.conversations.type is 'private | group | saved (личные заметки пользователя)';
