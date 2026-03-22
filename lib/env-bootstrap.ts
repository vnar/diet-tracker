/**
 * Default local DB: SQLite file (no Docker/Postgres required).
 * Override with DATABASE_URL in .env.local, e.g. postgresql://... for production.
 */
if (
  typeof process !== "undefined" &&
  !process.env.DATABASE_URL &&
  process.env.NODE_ENV !== "production"
) {
  process.env.DATABASE_URL = "file:./dev.db";
}
