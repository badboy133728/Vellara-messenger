-- ============================================================
-- Vellara: полная схема для Supabase
-- Скопируйте ВЕСЬ этот файл в Supabase → SQL Editor → Run
-- НЕ вставляйте путь к файлу (supabase/migrations/...)
-- ============================================================

-- ========== 001_schema.sql ==========

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  last_name text not null default '',
  avatar text,
  background text,
  background_gradient text,
  bio text,
  theme text not null default 'gold-dark',
  profile_visibility text not null default 'everyone',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists profiles_name_idx on public.profiles (name, last_name);

create table if not exists public.conversations (
  id bigserial primary key,
  type text not null default 'private',
  title text,
  created_by uuid references public.profiles (id) on delete set null,
  allow_voice_messages boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  id bigserial primary key,
  conversation_id bigint not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member',
  last_read_at timestamptz,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx on public.conversation_members (user_id);
create index if not exists conversation_members_conv_idx on public.conversation_members (conversation_id);

create table if not exists public.messages (
  id bigserial primary key,
  conversation_id bigint not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_type text not null default 'user',
  content text not null default '',
  read_at timestamptz,
  file_path text,
  file_type text,
  file_original_name text,
  voice_duration integer,
  album_group_id uuid,
  is_edited boolean not null default false,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_conv_created_idx on public.messages (conversation_id, created_at);
create index if not exists messages_user_idx on public.messages (user_id);
create index if not exists messages_read_at_idx on public.messages (conversation_id, read_at);

create table if not exists public.user_contacts (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  contact_id uuid not null references public.profiles (id) on delete cascade,
  label text,
  is_blocked boolean not null default false,
  status text not null default 'accepted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, contact_id)
);

create index if not exists user_contacts_user_idx on public.user_contacts (user_id);
create index if not exists user_contacts_contact_idx on public.user_contacts (contact_id);

create table if not exists public.call_logs (
  id bigserial primary key,
  caller_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  room_id uuid,
  type text not null default 'voice',
  status text not null default 'ringing',
  started_at timestamptz,
  ended_at timestamptz,
  duration integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists call_logs_caller_idx on public.call_logs (caller_id, created_at desc);
create index if not exists call_logs_receiver_idx on public.call_logs (receiver_id, created_at desc);

create table if not exists public.saved_messages (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id bigint not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);

create index if not exists saved_messages_user_idx on public.saved_messages (user_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'last_name', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();
drop trigger if exists conversation_members_updated_at on public.conversation_members;
create trigger conversation_members_updated_at before update on public.conversation_members
  for each row execute function public.set_updated_at();
drop trigger if exists messages_updated_at on public.messages;
create trigger messages_updated_at before update on public.messages
  for each row execute function public.set_updated_at();
drop trigger if exists user_contacts_updated_at on public.user_contacts;
create trigger user_contacts_updated_at before update on public.user_contacts
  for each row execute function public.set_updated_at();
drop trigger if exists call_logs_updated_at on public.call_logs;
create trigger call_logs_updated_at before update on public.call_logs
  for each row execute function public.set_updated_at();

-- ========== 002_rls.sql ==========

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.user_contacts enable row level security;
alter table public.call_logs enable row level security;
alter table public.saved_messages enable row level security;

create or replace function public.is_conversation_member(conv_id bigint, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv_id and user_id = uid
  );
$$;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

drop policy if exists "conversations_select_member" on public.conversations;
create policy "conversations_select_member" on public.conversations for select
  using (public.is_conversation_member(id, auth.uid()));
drop policy if exists "conversations_insert_auth" on public.conversations;
create policy "conversations_insert_auth" on public.conversations for insert
  with check (auth.uid() is not null);
drop policy if exists "conversations_update_member" on public.conversations;
create policy "conversations_update_member" on public.conversations for update
  using (public.is_conversation_member(id, auth.uid()));

drop policy if exists "members_select_same_conv" on public.conversation_members;
create policy "members_select_same_conv" on public.conversation_members for select
  using (public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "members_insert_self_or_admin" on public.conversation_members;
create policy "members_insert_self_or_admin" on public.conversation_members for insert
  with check (auth.uid() is not null);
drop policy if exists "members_update_own" on public.conversation_members;
create policy "members_update_own" on public.conversation_members for update
  using (user_id = auth.uid() or public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "members_delete_admin" on public.conversation_members;
create policy "members_delete_admin" on public.conversation_members for delete
  using (public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "messages_select_member" on public.messages;
create policy "messages_select_member" on public.messages for select
  using (public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "messages_insert_member" on public.messages;
create policy "messages_insert_member" on public.messages for insert
  with check (user_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages for update
  using (user_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists "messages_mark_read_by_member" on public.messages;
create policy "messages_mark_read_by_member" on public.messages for update
  using (
    public.is_conversation_member(conversation_id, auth.uid())
    and user_id <> auth.uid()
  )
  with check (
    public.is_conversation_member(conversation_id, auth.uid())
    and user_id <> auth.uid()
  );

drop policy if exists "contacts_select_own" on public.user_contacts;
create policy "contacts_select_own" on public.user_contacts for select
  using (user_id = auth.uid() or contact_id = auth.uid());
drop policy if exists "contacts_insert_own" on public.user_contacts;
create policy "contacts_insert_own" on public.user_contacts for insert
  with check (user_id = auth.uid());
drop policy if exists "contacts_update_involved" on public.user_contacts;
create policy "contacts_update_involved" on public.user_contacts for update
  using (user_id = auth.uid() or contact_id = auth.uid());
drop policy if exists "contacts_delete_own" on public.user_contacts;
create policy "contacts_delete_own" on public.user_contacts for delete
  using (user_id = auth.uid());

drop policy if exists "calls_select_participant" on public.call_logs;
create policy "calls_select_participant" on public.call_logs for select
  using (caller_id = auth.uid() or receiver_id = auth.uid());
drop policy if exists "calls_insert_caller" on public.call_logs;
create policy "calls_insert_caller" on public.call_logs for insert
  with check (caller_id = auth.uid());
drop policy if exists "calls_update_participant" on public.call_logs;
create policy "calls_update_participant" on public.call_logs for update
  using (caller_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists "saved_select_own" on public.saved_messages;
create policy "saved_select_own" on public.saved_messages for select using (user_id = auth.uid());
drop policy if exists "saved_insert_own" on public.saved_messages;
create policy "saved_insert_own" on public.saved_messages for insert with check (user_id = auth.uid());
drop policy if exists "saved_delete_own" on public.saved_messages;
create policy "saved_delete_own" on public.saved_messages for delete using (user_id = auth.uid());

-- ========== 003_realtime_storage.sql ==========

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.conversation_members;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.user_contacts;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.call_logs;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('backgrounds', 'backgrounds', true),
  ('messages', 'messages', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars_auth_upload" on storage.objects;
create policy "avatars_auth_upload" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "avatars_auth_update" on storage.objects;
create policy "avatars_auth_update" on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "avatars_auth_delete" on storage.objects;
create policy "avatars_auth_delete" on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "backgrounds_public_read" on storage.objects;
create policy "backgrounds_public_read" on storage.objects for select using (bucket_id = 'backgrounds');
drop policy if exists "backgrounds_auth_upload" on storage.objects;
create policy "backgrounds_auth_upload" on storage.objects for insert
  with check (bucket_id = 'backgrounds' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "messages_public_read" on storage.objects;
create policy "messages_public_read" on storage.objects for select using (bucket_id = 'messages');
drop policy if exists "messages_auth_upload" on storage.objects;
create policy "messages_auth_upload" on storage.objects for insert
  with check (bucket_id = 'messages' and auth.uid() is not null);

-- ========== 006_push_subscriptions.sql ==========
create table if not exists public.push_subscriptions (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
drop trigger if exists push_subscriptions_updated_at on public.push_subscriptions;
create trigger push_subscriptions_updated_at before update on public.push_subscriptions
  for each row execute function public.set_updated_at();
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_select_own" on public.push_subscriptions;
create policy "push_select_own" on public.push_subscriptions for select using (user_id = auth.uid());
drop policy if exists "push_insert_own" on public.push_subscriptions;
create policy "push_insert_own" on public.push_subscriptions for insert with check (user_id = auth.uid());
drop policy if exists "push_update_own" on public.push_subscriptions;
create policy "push_update_own" on public.push_subscriptions for update using (user_id = auth.uid());
drop policy if exists "push_delete_own" on public.push_subscriptions;
create policy "push_delete_own" on public.push_subscriptions for delete using (user_id = auth.uid());

-- ========== 007_message_replies.sql ==========
alter table public.messages
  add column if not exists reply_to_id bigint references public.messages (id) on delete set null;

create index if not exists messages_reply_to_idx on public.messages (reply_to_id);

-- ========== 008_realtime_replica_identity.sql ==========
alter table public.messages replica identity full;
alter table public.conversation_members replica identity full;

-- ========== 009_typing_at.sql ==========
alter table public.conversation_members
  add column if not exists last_typing_at timestamptz;

-- ========== 010_push_last_active.sql ==========
alter table public.push_subscriptions
  add column if not exists last_active_at timestamptz;

create index if not exists push_subscriptions_active_idx
  on public.push_subscriptions (user_id, last_active_at desc);
