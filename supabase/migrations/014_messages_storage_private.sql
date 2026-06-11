-- Закрываем bucket messages: только участники чата с этим вложением.

update storage.buckets
set public = false
where id = 'messages';

create or replace function public.can_read_message_file(file_path text, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.messages m
    join public.conversation_members cm
      on cm.conversation_id = m.conversation_id
     and cm.user_id = uid
    where m.file_path = file_path
      and m.deleted_at is null
  );
$$;

drop policy if exists "messages_public_read" on storage.objects;

create policy "messages_member_read" on storage.objects
for select
using (
  bucket_id = 'messages'
  and public.can_read_message_file('messages/' || name, auth.uid())
);

drop policy if exists "messages_auth_upload" on storage.objects;

create policy "messages_auth_upload" on storage.objects
for insert
with check (
  bucket_id = 'messages'
  and auth.uid() is not null
  and auth.uid()::text = (storage.foldername(name))[1]
);

grant execute on function public.can_read_message_file(text, uuid) to authenticated;
