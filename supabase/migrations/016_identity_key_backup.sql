-- Резервная копия приватного ключа E2E (зашифрована кодом восстановления на клиенте).

alter table public.profiles
  add column if not exists identity_key_backup text;
