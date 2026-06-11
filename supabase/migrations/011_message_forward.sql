alter table public.messages
  add column if not exists forwarded_from_id bigint references public.messages (id) on delete set null,
  add column if not exists forwarded_from_conversation_id bigint references public.conversations (id) on delete set null,
  add column if not exists forwarded_from_sender_name text;

create index if not exists messages_forwarded_from_idx on public.messages (forwarded_from_id);
