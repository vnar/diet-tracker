# HealthOS (diet-tracker)

Daily weight dashboard with email/password auth and optional Postgres for production.

## Run locally (no Docker required)

```bash
npm install
npm run db:migrate
npm run dev
```

By default the app uses **SQLite** at `prisma/dev.db` (created on first migrate). Sign up at `/login` works without Postgres.

## Optional: Postgres (e.g. production)

Set `DATABASE_URL` to a PostgreSQL URL and change `provider` in `prisma/schema.prisma` to `postgresql`, then run migrations for that provider.

## Docker Postgres (optional, local)

```bash
docker compose up -d
# Set DATABASE_URL=postgresql://healthos:healthos@127.0.0.1:5432/healthos
# and switch Prisma provider to postgresql — only if you want Postgres locally.
```

## Product spec

See [`PROMPT.md`](PROMPT.md).
