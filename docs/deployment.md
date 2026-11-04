# Deployment

CareChaos is a standard Next.js app. The simulation engine runs in the browser; the server only stores and replays experiment configurations.

## Vercel + Neon (recommended)

1. Push the repository to GitHub and **Import** it in Vercel. Framework preset: Next.js. No build settings to change.
2. In the project, open **Storage → Marketplace → Neon → Add**. This creates a Postgres database and sets `DATABASE_URL`, `POSTGRES_URL` and related variables for Production, Preview and Development.
3. Deploy. The `experiments` table is created on first use.
4. Open **Settings** in the app. It should say `postgres · persistent`.

CLI equivalent:

```bash
vercel integration add neon --name carechaos-db
vercel deploy --prod
```

Deployment Protection is a Vercel project setting. If it is on, visitors are redirected to a Vercel login; turn it off under **Project → Settings → Deployment Protection** to make the demo public.

## GitHub sign-in

Sign-in is optional and off until configured. Without it, history belongs to an anonymous browser cookie.

1. On GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**.
   * Homepage URL: `https://YOUR-DOMAIN`
   * Authorization callback URL: `https://YOUR-DOMAIN/api/auth/github/callback`
2. Copy the **Client ID** and generate a **Client secret**.
3. Set environment variables (Vercel example):

```bash
vercel env add GITHUB_CLIENT_ID production
vercel env add GITHUB_CLIENT_SECRET production
openssl rand -hex 32 | vercel env add SESSION_SECRET production
vercel deploy --prod
```

4. A **Sign in with GitHub** button appears in the header. Signing in moves the experiments saved from the current browser to your account, so your history follows you across devices.

What is stored: your numeric GitHub ID and login, inside a signed `httpOnly` cookie. The access token is discarded immediately after reading your profile, and no scopes beyond public profile are requested. Check `GET /api/auth/me` to see whether sign-in is enabled.

## Without a database

Without `DATABASE_URL`, Vercel runs with an ephemeral `/tmp` SQLite file: everything works, but history resets when the function restarts. Locally, history is stored in `data/carechaos.db` (override with `CARECHAOS_DB_PATH`).

## Other hosts

Any Node ≥ 22.5 host works: `npm run build && npm start`. Set `DATABASE_URL` for Postgres or mount a persistent path and set `CARECHAOS_DB_PATH`. Set `NEXT_PUBLIC_SITE_URL` so link previews use your domain.

## Health check

`GET /api/health` returns `{ ok, version, engine, storage: { kind, persistent } }` and never includes secrets.
