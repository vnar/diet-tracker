#!/usr/bin/env node
/**
 * Proves whether the HTTP API is reachable from this machine (same as browser fetch to API Gateway).
 * Reads NEXT_PUBLIC_AWS_API_URL from process.env or from .env.local (first 80 lines, KEY=value only).
 * Does not print secret values.
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

function normalizeBase(raw) {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
  return withScheme.replace(/\/+$/, "");
}

function redactHost(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/…`;
  } catch {
    return "(invalid URL)";
  }
}

loadEnvLocal();

const raw = process.env.NEXT_PUBLIC_AWS_API_URL ?? "";
const base = normalizeBase(raw);
const useAws = String(process.env.NEXT_PUBLIC_USE_AWS_BACKEND ?? "").toLowerCase() === "true";

console.log("--- diet-tracker AWS API diagnostic ---");
console.log(`NEXT_PUBLIC_USE_AWS_BACKEND=${useAws}`);
console.log(`NEXT_PUBLIC_AWS_API_URL set: ${Boolean(raw.trim())}`);
console.log(`Normalized base (host only): ${base ? redactHost(base + "/") : "(empty)"}`);

if (!base) {
  console.error("\nFAIL: Set NEXT_PUBLIC_AWS_API_URL in .env.local or the shell, then re-run.");
  process.exit(1);
}

const url = `${base}/entries`;
console.log(`\nGET ${redactHost(url)} …`);

const ac = new AbortController();
const t = setTimeout(() => ac.abort(), 20000);

try {
  const res = await fetch(url, { method: "GET", signal: ac.signal });
  clearTimeout(t);
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(`Body (first 200 chars): ${text.slice(0, 200).replace(/\s+/g, " ")}`);

  if (res.status === 401 || res.status === 403) {
    console.log("\nOK: API is reachable. 401/403 without a Cognito token is expected.");
    process.exit(0);
  }
  if (res.ok) {
    console.log("\nOK: API returned 2xx (unexpected for unauthenticated /entries but host works).");
    process.exit(0);
  }
  console.log("\nWARN: Unexpected status — check API authorizer and routes.");
  process.exit(0);
} catch (e) {
  clearTimeout(t);
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`\nFAIL: fetch threw: ${msg}`);
  console.error("If this fails here, the browser will show “Couldn’t reach the server” too.");
  process.exit(1);
}
