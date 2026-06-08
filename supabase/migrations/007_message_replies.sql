-- Reply-to message reference

alter table public.messages
  add column if not exists reply_to_id bigint references public.messages (id) on delete set null;

create index if not exists messages_reply_to_idx on public.messages (reply_to_id);
