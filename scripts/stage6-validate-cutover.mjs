#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const stackName = process.env.CDK_STACK_NAME ?? "DietTrackerBackendFoundation";
const region = process.env.AWS_REGION ?? "us-east-1";
const amplifyAppId = process.env.AMPLIFY_APP_ID;
const amplifyBranch = process.env.AMPLIFY_BRANCH;
const testEmail = process.env.SMOKE_TEST_EMAIL;
const testPassword = process.env.SMOKE_TEST_PASSWORD;

function run(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  return execFileSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  }).trim();
}

function requiredEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function jsonHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) ${url}: ${JSON.stringify(data)}`);
  }
  return data;
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
  const map = Object.fromEntries(outputs.map((entry) => [entry.OutputKey, entry.OutputValue]));
  return {
    apiUrl: requiredEnv("ApiUrl", map.ApiUrl),
    userPoolId: requiredEnv("UserPoolId", map.UserPoolId),
    userPoolClientId: requiredEnv("UserPoolClientId", map.UserPoolClientId),
    bucketName: requiredEnv("BucketName", map.BucketName),
  };
}

function configureAmplifyEnv(outputs) {
  if (!amplifyAppId || !amplifyBranch) {
    console.log("Skipping Amplify env update (set AMPLIFY_APP_ID and AMPLIFY_BRANCH to enable).");
    return;
  }

  const envVars = [
    "NEXT_PUBLIC_USE_AWS_BACKEND=true",
    `NEXT_PUBLIC_AWS_API_URL=${outputs.apiUrl}`,
    `NEXT_PUBLIC_AWS_REGION=${region}`,
    `NEXT_PUBLIC_COGNITO_USER_POOL_ID=${outputs.userPoolId}`,
    `NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=${outputs.userPoolClientId}`,
  ].join(",");

  run("aws", [
    "amplify",
    "update-branch",
    "--app-id",
    amplifyAppId,
    "--branch-name",
    amplifyBranch,
    "--region",
    region,
    "--environment-variables",
    envVars,
    "--output",
    "json",
  ]);
  console.log("Amplify branch environment variables updated.");
}

function getAccessToken(userPoolClientId) {
  const username = requiredEnv("SMOKE_TEST_EMAIL", testEmail);
  const password = requiredEnv("SMOKE_TEST_PASSWORD", testPassword);
  const raw = run("aws", [
    "cognito-idp",
    "initiate-auth",
    "--region",
    region,
    "--auth-flow",
    "USER_PASSWORD_AUTH",
    "--client-id",
    userPoolClientId,
    "--auth-parameters",
    `USERNAME=${username},PASSWORD=${password}`,
    "--output",
    "json",
  ]);
  const auth = JSON.parse(raw);
  const accessToken = auth?.AuthenticationResult?.AccessToken;
  return requiredEnv("AuthenticationResult.AccessToken", accessToken);
}

async function runSmokeTests(outputs) {
  if (!testEmail || !testPassword) {
    console.log("Skipping smoke tests (set SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD to enable).");
    return;
  }

  const accessToken = getAccessToken(outputs.userPoolClientId);
  const baseUrl = outputs.apiUrl.replace(/\/+$/, "");
  const date = new Date().toISOString().slice(0, 10);

  const putEntryPayload = {
    date,
    morningWeight: 80.5,
    nightWeight: 80.1,
    calories: 2100,
    protein: 160,
    steps: 9000,
    sleep: 7.5,
    lateSnack: false,
    highSodium: false,
    workout: true,
    alcohol: false,
    notes: "stage6 smoke",
  };

  const putEntry = await fetchJson(`${baseUrl}/entries`, {
    method: "PUT",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(putEntryPayload),
  });
  if (!putEntry.entry?.id) {
    throw new Error("Smoke test failed: /entries PUT did not return entry.id");
  }

  const entries = await fetchJson(`${baseUrl}/entries`, {
    method: "GET",
    headers: jsonHeaders(accessToken),
  });
  if (!Array.isArray(entries.entries) || entries.entries.length === 0) {
    throw new Error("Smoke test failed: /entries GET returned no entries");
  }

  const settingsPayload = {
    goalWeight: 72,
    startWeight: 85,
    targetDate: date,
    unit: "kg",
  };
  await fetchJson(`${baseUrl}/settings`, {
    method: "PATCH",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(settingsPayload),
  });
  const settings = await fetchJson(`${baseUrl}/settings`, {
    method: "GET",
    headers: jsonHeaders(accessToken),
  });
  if (!settings.settings || settings.settings.unit !== "kg") {
    throw new Error("Smoke test failed: /settings GET payload mismatch");
  }

  const uploadInit = await fetchJson(`${baseUrl}/photos/upload-url`, {
    method: "POST",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify({
      fileName: "stage6-smoke.jpg",
      contentType: "image/jpeg",
      extension: "jpg",
      date,
    }),
  });
  if (!uploadInit.uploadUrl || !uploadInit.photoUrl) {
    throw new Error("Smoke test failed: /photos/upload-url payload mismatch");
  }

  const uploadRes = await fetch(uploadInit.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: Buffer.from("stage6-smoke-photo"),
  });
  if (!uploadRes.ok) {
    throw new Error(`Smoke test failed: S3 upload failed (${uploadRes.status})`);
  }

  console.log("Smoke tests passed: entries, settings, and photo upload.");
}

async function main() {
  run("aws", ["sts", "get-caller-identity", "--output", "json"]);

  run("npm", ["run", "infra:cdk:bootstrap"]);
  run("npm", ["--prefix", "infra/cdk", "run", "deploy", "--", "--require-approval", "never"]);

  const outputs = getStackOutputs();
  console.log(`Stack outputs loaded. Bucket: ${outputs.bucketName}`);

  configureAmplifyEnv(outputs);
  await runSmokeTests(outputs);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
