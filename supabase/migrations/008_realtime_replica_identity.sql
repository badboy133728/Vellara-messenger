-- Required for filtered postgres_changes subscriptions (conversation_id=eq.N)
alter table public.messages replica identity full;
alter table public.conversation_members replica identity full;
