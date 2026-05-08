#!/usr/bin/env node
/**
 * Run on Amplify before `next build` so a missing API URL cannot ship as a silent broken static site.
 * Loads `.env.local` when present (same rules as diag-aws) so local `node scripts/...` matches Next.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvLocal();

const onAmplify = Boolean(process.env.AWS_APP_ID?.trim());
const useAws = String(process.env.NEXT_PUBLIC_USE_AWS_BACKEND ?? "").toLowerCase() === "true";
const apiUrl = (process.env.NEXT_PUBLIC_AWS_API_URL ?? "").trim();
const pool = (process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "").trim();
const client = (process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID ?? "").trim();

console.log("[assert-next-public-aws] AWS_APP_ID present (Amplify build):", onAmplify);
console.log("[assert-next-public-aws] NEXT_PUBLIC_USE_AWS_BACKEND:", useAws);

if (!onAmplify) {
  console.log("[assert-next-public-aws] Not an Amplify build — skipping strict env gate.");
  process.exit(0);
}

if (!useAws) {
  console.log("[assert-next-public-aws] Amplify build has AWS backend disabled — OK.");
  process.exit(0);
}

const missing = [];
if (!apiUrl) missing.push("NEXT_PUBLIC_AWS_API_URL");
if (!pool) missing.push("NEXT_PUBLIC_COGNITO_USER_POOL_ID");
if (!client) missing.push("NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID");

if (missing.length > 0) {
  console.error("\n[assert-next-public-aws] FATAL: This Amplify build has NEXT_PUBLIC_USE_AWS_BACKEND=true");
  console.error("but the following variables are empty or missing:\n");
  missing.forEach((k) => console.error("  -", k));
  console.error("\nFix: AWS Amplify Console → App → Hosting → Environment variables");
  console.error("Add the values from: node scripts/print-dotenv-local-from-stack.mjs");
  console.error("(Copy the NEXT_PUBLIC_* lines; no secrets in those.)\n");
  process.exit(1);
}

console.log("[assert-next-public-aws] Required NEXT_PUBLIC_* AWS vars are set — OK.");
process.exit(0);
