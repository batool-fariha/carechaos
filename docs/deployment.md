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

## Without a database

Without `DATABASE_URL`, Vercel runs with an ephemeral `/tmp` SQLite file: everything works, but history resets when the function restarts. Locally, history is stored in `data/carechaos.db` (override with `CARECHAOS_DB_PATH`).

## Other hosts

Any Node ≥ 22.5 host works: `npm run build && npm start`. Set `DATABASE_URL` for Postgres or mount a persistent path and set `CARECHAOS_DB_PATH`. Set `NEXT_PUBLIC_SITE_URL` so link previews use your domain.

## Health check

`GET /api/health` returns `{ ok, version, engine, storage: { kind, persistent } }` and never includes secrets.
