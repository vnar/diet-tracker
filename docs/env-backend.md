# Environment

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Optional in dev: defaults to **`file:./prisma/dev.db`** (SQLite). |
| `AUTH_SECRET` | Required for production sessions; dev has a fallback in `auth.ts`. |
| `AUTH_URL` | Public site URL in production. |

Prisma CLI loads `.env` from the project root. For `migrate`, either rely on the same default or set `DATABASE_URL` explicitly.
