#!/usr/bin/env node

function fail(message) {
  // eslint-disable-next-line no-console
  console.error(`\n[deploy-guard] ${message}\n`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  fail(
    "DATABASE_URL is missing. Configure a persistent database URL (for example: PostgreSQL) in Amplify environment variables before deploying."
  );
}

const lowered = databaseUrl.toLowerCase();
if (
  lowered.startsWith("file:") ||
  lowered.startsWith("sqlite:") ||
  lowered.includes(".db")
) {
  fail(
    "DATABASE_URL points to SQLite/file storage. Deploys must use a persistent managed database to prevent data loss."
  );
}

const acceptedSchemes = [
  "postgres://",
  "postgresql://",
  "mysql://",
  "sqlserver://",
  "mongodb://",
  "mongodb+srv://",
  "cockroachdb://",
];

if (!acceptedSchemes.some((scheme) => lowered.startsWith(scheme))) {
  fail(
    `Unsupported DATABASE_URL scheme for production deploy: ${databaseUrl}. Use a persistent managed database URL.`
  );
}

// eslint-disable-next-line no-console
console.log("[deploy-guard] Persistent DATABASE_URL check passed.");
