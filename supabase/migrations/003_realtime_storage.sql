-- Realtime publication + storage buckets

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversation_members;
alter publication supabase_realtime add table public.user_contacts;
alter publication supabase_realtime add table public.call_logs;

-- Storage buckets (run in Supabase dashboard or via API)
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('backgrounds', 'backgrounds', true),
  ('messages', 'messages', true)
on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_auth_upload" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "avatars_auth_update" on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "avatars_auth_delete" on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "backgrounds_public_read" on storage.objects for select
  using (bucket_id = 'backgrounds');

create policy "backgrounds_auth_upload" on storage.objects for insert
  with check (bucket_id = 'backgrounds' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "messages_public_read" on storage.objects for select
  using (bucket_id = 'messages');

create policy "messages_auth_upload" on storage.objects for insert
  with check (bucket_id = 'messages' and auth.uid() is not null);
