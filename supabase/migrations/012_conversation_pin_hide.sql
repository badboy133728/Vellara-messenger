alter table public.conversation_members
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pinned_at timestamptz,
  add column if not exists hidden_at timestamptz;

create index if not exists conversation_members_user_pinned_idx
  on public.conversation_members (user_id, is_pinned desc, pinned_at desc nulls last);

create index if not exists conversation_members_user_hidden_idx
  on public.conversation_members (user_id, hidden_at);
