-- Skip Web Push to devices where the app tab is currently open

alter table public.push_subscriptions
  add column if not exists last_active_at timestamptz;

create index if not exists push_subscriptions_active_idx
  on public.push_subscriptions (user_id, last_active_at desc);
