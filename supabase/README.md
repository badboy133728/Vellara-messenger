# Supabase migrations for Vellara

## Как выполнить (важно)

В **Supabase → SQL Editor** нужно вставлять **текст SQL**, а не путь к файлу.

❌ Неправильно: `supabase/migrations/001_schema.sql`  
✅ Правильно: открыть файл в Cursor/Блокноте, **Ctrl+A → Ctrl+C**, вставить в SQL Editor, **Run**

### Вариант A — один раз (проще)

1. Откройте файл [`apply-all.sql`](apply-all.sql) в проекте
2. Скопируйте **весь** текст
3. Supabase Dashboard → **SQL Editor** → New query → вставить → **Run**

### Вариант B — по частям

По очереди скопируйте содержимое (не путь!) файлов:

1. `migrations/001_schema.sql`
2. `migrations/002_rls.sql`
3. `migrations/003_realtime_storage.sql`
4. … остальные по номеру до **`015_e2e_encryption.sql`** (ключи E2E; после `014_messages_storage_private.sql`)

После миграции включите **Email** в Authentication → Providers.

Ключи проекта — в `next/.env.local` (см. `next/.env.example`).
