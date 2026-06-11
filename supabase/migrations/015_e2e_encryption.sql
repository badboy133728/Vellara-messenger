-- Сквозное шифрование: публичные ключи и обёртки ключей бесед.

alter table public.profiles
  add column if not exists identity_public_key text;

create table if not exists public.conversation_key_envelopes (
  conversation_id bigint not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  envelope text not null,
  key_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_key_envelopes_conv_idx
  on public.conversation_key_envelopes (conversation_id);

alter table public.conversation_key_envelopes enable row level security;

drop policy if exists "e2e_envelopes_select_own" on public.conversation_key_envelopes;
create policy "e2e_envelopes_select_own" on public.conversation_key_envelopes
for select using (
  user_id = auth.uid()
  and public.is_conversation_member(conversation_id, auth.uid())
);

drop policy if exists "e2e_envelopes_upsert_member" on public.conversation_key_envelopes;
create policy "e2e_envelopes_upsert_member" on public.conversation_key_envelopes
for insert with check (
  public.is_conversation_member(conversation_id, auth.uid())
);

drop policy if exists "e2e_envelopes_update_member" on public.conversation_key_envelopes;
create policy "e2e_envelopes_update_member" on public.conversation_key_envelopes
for update using (
  public.is_conversation_member(conversation_id, auth.uid())
);

grant select on public.conversation_key_envelopes to authenticated;
grant insert, update on public.conversation_key_envelopes to authenticated;
