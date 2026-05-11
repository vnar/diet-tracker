#!/usr/bin/env node
/**
 * Sends one test weekly-report email via POST /v2/weekly-report/send-email.
 * Uses Cognito USER_PASSWORD_AUTH (same as scripts/stage6-validate-cutover.mjs).
 *
 * Usage:
 *   SMOKE_TEST_EMAIL=you@example.com SMOKE_TEST_PASSWORD='…' node scripts/send-weekly-report-test-email.mjs
 *
 * If unset, reads SMOKE_TEST_EMAIL / SMOKE_TEST_PASSWORD from repo-root `.env.local` (no shell export).
 *
 * Optional: CDK_STACK_NAME (default DietTrackerBackendFoundation), AWS_REGION (default us-east-1).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load specific keys from .env.local (process.env wins). */
function loadEnvLocal() {
  const file = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    if (key !== "SMOKE_TEST_EMAIL" && key !== "SMOKE_TEST_PASSWORD") continue;
    if (process.env[key] != null && String(process.env[key]).length > 0) continue;
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvLocal();

const stackName = process.env.CDK_STACK_NAME ?? "DietTrackerBackendFoundation";
const region = process.env.AWS_REGION ?? "us-east-1";
const email = process.env.SMOKE_TEST_EMAIL?.trim();
const password = process.env.SMOKE_TEST_PASSWORD;

function run(command, args) {
  return execFileSync(command, args, { stdio: "pipe", encoding: "utf8" }).trim();
}

function required(name, value) {
  if (!value) {
    console.error(`Missing ${name}. Set SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD.`);
    process.exit(1);
  }
  return value;
}

function getStackOutputs() {
  const raw = run("aws", [
    "cloudformation",
    "describe-stacks",
    "--region",
    region,
    "--stack-name",
    stackName,
    "--query",
    "Stacks[0].Outputs",
    "--output",
    "json",
  ]);
  const outputs = JSON.parse(raw);
  const map = Object.fromEntries(outputs.map((e) => [e.OutputKey, e.OutputValue]));
  const apiUrl = required("ApiUrl output", map.ApiUrl);
  const clientId = required("UserPoolClientId output", map.UserPoolClientId);
  return { apiUrl: apiUrl.replace(/\/+$/, ""), clientId };
}

function getAccessToken(clientId, username, pass) {
  const raw = run("aws", [
    "cognito-idp",
    "initiate-auth",
    "--region",
    region,
    "--auth-flow",
    "USER_PASSWORD_AUTH",
    "--client-id",
    clientId,
    "--auth-parameters",
    `USERNAME=${username},PASSWORD=${pass}`,
    "--output",
    "json",
  ]);
  const auth = JSON.parse(raw);
  const token = auth?.AuthenticationResult?.AccessToken;
  if (!token) {
    console.error("No AccessToken in AuthenticationResult:", JSON.stringify(auth, null, 2));
    process.exit(1);
  }
  return token;
}

const { apiUrl, clientId } = getStackOutputs();
const user = required("SMOKE_TEST_EMAIL", email);
const pass = required("SMOKE_TEST_PASSWORD", password);
const accessToken = getAccessToken(clientId, user, pass);

const body = {
  htmlBody: `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;padding:28px 24px;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:13px;color:#71717a;letter-spacing:0.02em;">Ojas Health</p>
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.25;">Your week on Ojas Health</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#3f3f46;">
            Here is a quick summary test. Your signed-in data lives in the app — this email only confirms delivery.
          </p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#3f3f46;">
            <a href="https://ojas-health.com/" style="color:#2563eb;text-decoration:none;font-weight:600;">Open ojas-health.com</a>
            <span style="color:#71717a;"> — same site your browser trusts.</span>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">
            Reply to this message if you need help. To train Gmail: move this to Primary and “Report not spam” once.
          </p>
          <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;" />
          <p style="margin:0;font-size:11px;color:#a1a1aa;line-height:1.45;">
            You asked for this email from your Ojas Health account (user-initiated). Not bulk marketing.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  textBody:
    "Ojas Health — Your week on Ojas Health\n\nQuick summary test. Open https://ojas-health.com/ in your browser.\n\nYou asked for this email from your Ojas Health account.",
  subject: "Your week on Ojas Health",
};

const res = await fetch(`${apiUrl}/v2/weekly-report/send-email`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "x-cognito-access-token": accessToken,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  data = text;
}

if (!res.ok) {
  console.error(`HTTP ${res.status}:`, data);
  process.exit(1);
}

console.log("OK:", JSON.stringify(data, null, 2));
