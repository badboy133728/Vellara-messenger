# Vellara Next.js

Мессенджер на **Next.js 15** + **Supabase**, деплой на **Vercel**.

В монорепозитории приложение лежит в папке **`next/`** — именно её указывайте как Root Directory на Vercel.

## Локальный запуск

1. Проект в [Supabase](https://supabase.com).
2. SQL: скопируйте весь [`../supabase/apply-all.sql`](../supabase/apply-all.sql) в Supabase → SQL Editor → Run.
3. Authentication → Providers → включите **Email**.
4. Скопируйте `.env.example` → `.env.local`, заполните ключи.
5. `npm install` && `npm run dev` → http://localhost:3000

## Деплой на Vercel

### 1. Код на GitHub

Папки `next/` и `supabase/` должны быть в репозитории (ветка `main`):

```bash
git add next supabase
git commit -m "Add Next.js app for Vercel"
git push origin main
```

### 2. Новый проект Vercel

1. [vercel.com/new](https://vercel.com/new) → Import репозитория `Vellara`.
2. **Root Directory** → `Edit` → выберите **`next`** (обязательно).
3. Framework: Next.js (определится автоматически).
4. **Environment Variables** — добавьте для Production (и Preview, если нужно):

| Переменная | Где взять |
|------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role (**секрет**, только сервер) |
| `NEXT_PUBLIC_APP_URL` | URL Vercel после первого деплоя, напр. `https://vellara.vercel.app` |

Опционально: `WEBRTC_ICE_SERVERS`, `SUPABASE_CONNECT_TIMEOUT_MS`.

5. **Deploy**.

После первого деплоя обновите `NEXT_PUBLIC_APP_URL` на финальный домен и сделайте **Redeploy**.

### 3. Настройка Supabase под прод

В Supabase → **Authentication** → **URL Configuration**:

- **Site URL**: `https://ваш-домен.vercel.app`
- **Redirect URLs** (добавить):
  - `https://ваш-домен.vercel.app/**`
  - `https://*.vercel.app/**` (для preview-деплоев)

В **Storage** должны быть бакеты из миграции (`avatars`, `chat-files` и т.д.) — они создаются через `apply-all.sql`.

В **Database** → **Replication**: для realtime чатов и presence таблицы `messages`, `profiles`, `conversation_members` должны быть в publication `supabase_realtime` (см. миграции 003 и 005).

### 4. Проверка после деплоя

- Регистрация / вход
- Создание чата и отправка сообщений
- Загрузка аватара
- Групповой чат

### CLI (альтернатива)

```bash
cd next
npx vercel login
npx vercel link
npx vercel env pull .env.local
# заполните секреты в Vercel Dashboard, затем:
npx vercel --prod
```

## API

REST: `/api/chat`, `/api/contacts`, `/api/calls`, `/api/settings` и др.

Realtime: Supabase Postgres Changes + Broadcast.
