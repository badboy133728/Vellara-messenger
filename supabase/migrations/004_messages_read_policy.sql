-- Allow conversation members to mark others' messages as read (read_at only enforced in app layer).
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
