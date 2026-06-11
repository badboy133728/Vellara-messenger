alter table public.conversation_members
  add column if not exists last_typing_at timestamptz;
