-- Realtime v2 hardening: filtered DELETE/UPDATE subscriptions for contacts and future call stream.

alter table public.user_contacts replica identity full;
alter table public.call_logs replica identity full;

-- Keep publication in sync for environments where older migration chain was partially applied.
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.user_contacts;
exception when duplicate_object then null;
end $$;
