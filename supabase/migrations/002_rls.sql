-- Row Level Security policies

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

-- Profiles
create policy "profiles_select" on public.profiles for select
  using (true);

create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id);

-- Conversations
create policy "conversations_select_member" on public.conversations for select
  using (public.is_conversation_member(id, auth.uid()));

create policy "conversations_insert_auth" on public.conversations for insert
  with check (auth.uid() is not null);

create policy "conversations_update_member" on public.conversations for update
  using (public.is_conversation_member(id, auth.uid()));

-- Conversation members
create policy "members_select_same_conv" on public.conversation_members for select
  using (public.is_conversation_member(conversation_id, auth.uid()));

create policy "members_insert_self_or_admin" on public.conversation_members for insert
  with check (auth.uid() is not null);

create policy "members_update_own" on public.conversation_members for update
  using (user_id = auth.uid() or public.is_conversation_member(conversation_id, auth.uid()));

create policy "members_delete_admin" on public.conversation_members for delete
  using (public.is_conversation_member(conversation_id, auth.uid()));

-- Messages
create policy "messages_select_member" on public.messages for select
  using (public.is_conversation_member(conversation_id, auth.uid()));

create policy "messages_insert_member" on public.messages for insert
  with check (
    user_id = auth.uid()
    and public.is_conversation_member(conversation_id, auth.uid())
  );

create policy "messages_update_own" on public.messages for update
  using (user_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));

-- Contacts
create policy "contacts_select_own" on public.user_contacts for select
  using (user_id = auth.uid() or contact_id = auth.uid());

create policy "contacts_insert_own" on public.user_contacts for insert
  with check (user_id = auth.uid());

create policy "contacts_update_involved" on public.user_contacts for update
  using (user_id = auth.uid() or contact_id = auth.uid());

create policy "contacts_delete_own" on public.user_contacts for delete
  using (user_id = auth.uid());

-- Call logs
create policy "calls_select_participant" on public.call_logs for select
  using (caller_id = auth.uid() or receiver_id = auth.uid());

create policy "calls_insert_caller" on public.call_logs for insert
  with check (caller_id = auth.uid());

create policy "calls_update_participant" on public.call_logs for update
  using (caller_id = auth.uid() or receiver_id = auth.uid());

-- Saved messages
create policy "saved_select_own" on public.saved_messages for select
  using (user_id = auth.uid());

create policy "saved_insert_own" on public.saved_messages for insert
  with check (user_id = auth.uid());

create policy "saved_delete_own" on public.saved_messages for delete
  using (user_id = auth.uid());
