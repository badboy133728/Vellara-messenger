-- Vellara messenger schema for Supabase (migrated from Laravel MySQL)

create extension if not exists "pgcrypto";

-- Profiles extend auth.users (name/email also stored here for easy queries)
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

-- Auto-create profile on signup
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

-- Updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();
create trigger conversation_members_updated_at before update on public.conversation_members
  for each row execute function public.set_updated_at();
create trigger messages_updated_at before update on public.messages
  for each row execute function public.set_updated_at();
create trigger user_contacts_updated_at before update on public.user_contacts
  for each row execute function public.set_updated_at();
create trigger call_logs_updated_at before update on public.call_logs
  for each row execute function public.set_updated_at();
