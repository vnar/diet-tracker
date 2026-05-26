#!/usr/bin/env node
/**
 * Push stack outputs + all NEXT_PUBLIC feature flags to an Amplify branch, then optionally start a build.
 *
 * Usage:
 *   AMPLIFY_APP_ID=d3e4993fjpbpy1 AMPLIFY_BRANCH=main node scripts/sync-amplify-env.mjs
 *   AMPLIFY_START_JOB=true node scripts/sync-amplify-env.mjs
 */
import { execFileSync } from "node:child_process";
import { formatNextPublicEnvFromStackOutputs } from "../lib/dev/stackEnvHints.mjs";

const stackName = process.env.CDK_STACK_NAME ?? "DietTrackerBackendFoundation";
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const amplifyAppId = process.env.AMPLIFY_APP_ID ?? "d3e4993fjpbpy1";
const amplifyBranch = process.env.AMPLIFY_BRANCH ?? "main";
const startJob = process.env.AMPLIFY_START_JOB === "true";

/** All client feature flags enabled for test portal / production parity. */
const FEATURE_FLAG_ENV = {
  NEXT_PUBLIC_INSIGHTS_V2_ENABLED: "true",
  NEXT_PUBLIC_INSIGHTS_LLM_REFINE: "true",
  NEXT_PUBLIC_FF_INSIGHTS_V2: "true",
  NEXT_PUBLIC_FF_INSIGHTS_LLM_REFINE: "true",
  NEXT_PUBLIC_INSIGHTS_SOURCE_LABEL: "true",
  NEXT_PUBLIC_FF_INSIGHTS_SOURCE_LABEL: "true",
  NEXT_PUBLIC_FF_BILLING_ENABLED: "true",
  NEXT_PUBLIC_FF_PRO_MONETIZATION: "true",
  NEXT_PUBLIC_FF_PHOTO_FOOD_LOG: "true",
  NEXT_PUBLIC_FF_MEAL_LIBRARY: "true",
  NEXT_PUBLIC_FF_NL_MEAL_PARSE: "true",
  NEXT_PUBLIC_FF_BODY_COMPARE_AI: "true",
  NEXT_PUBLIC_FF_PERSONALIZED_AI_COACHING: "true",
  NEXT_PUBLIC_FF_VOICE_DAILY_LOGGING: "true",
  NEXT_PUBLIC_FF_WEEKLY_REPORT: "true",
  NEXT_PUBLIC_FF_WEEKLY_REPORT_EMAIL: "true",
  NEXT_PUBLIC_FF_WEIGHT_CSV_EXPORT: "true",
  NEXT_PUBLIC_FF_PROGRESS_TIMELAPSE_SHARE: "true",
  NEXT_PUBLIC_FF_WEIGHT_LOG_STREAK: "true",
  NEXT_PUBLIC_FF_DAILY_READINESS_SCORE: "true",
  NEXT_PUBLIC_FF_MEAL_PLAN_TEASER: "true",
  NEXT_PUBLIC_FF_PROTEIN_HINT_STRIP: "true",
  NEXT_PUBLIC_FF_SLEEP_WEEK_CARD: "true",
  NEXT_PUBLIC_FF_MEDICATION_WELLNESS_CARD: "true",
  NEXT_PUBLIC_FF_PRO_VALUE_STRIP: "true",
  NEXT_PUBLIC_FF_REFERRAL_INVITE: "true",
  NEXT_PUBLIC_FF_YEAR_REVIEW_PAGE: "true",
  NEXT_PUBLIC_FF_AI_TRUST_FOOTER: "true",
  NEXT_PUBLIC_FF_CARE_CIRCLE_TEASER: "true",
  NEXT_PUBLIC_FF_WEARABLES_ROADMAP: "true",
  NEXT_PUBLIC_FF_LABS_ROADMAP: "true",
  NEXT_PUBLIC_FF_COMMUNITY_ROADMAP: "true",
  NEXT_PUBLIC_FF_EMPLOYER_WELLNESS_TEASER: "true",
  NEXT_PUBLIC_FF_SSO_FOR_TEAMS_TEASER: "true",
  NEXT_PUBLIC_FF_DEVELOPER_HOOKS_TEASER: "true",
  NEXT_PUBLIC_FF_LOCALE_ROADMAP_CARD: "true",
  NEXT_PUBLIC_APP_URL: "https://ojas-health.com",
  OJAS_GITHUB_REPO: "vnar/diet-tracker",
};

function run(command, args) {
  console.log(`$ ${command} ${args.join(" ")}`);
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
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
  return Object.fromEntries(outputs.map((entry) => [entry.OutputKey, entry.OutputValue]));
}

function parseEnvLines(lines) {
  const env = {};
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function toAmplifyEnvString(env) {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
}

function main() {
  const map = getStackOutputs();
  const stackLines = formatNextPublicEnvFromStackOutputs(map, region);
  const env = { ...parseEnvLines(stackLines), ...FEATURE_FLAG_ENV };

  const envString = toAmplifyEnvString(env);
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
    envString,
  ]);
  console.log(`Updated Amplify app ${amplifyAppId} branch ${amplifyBranch} (${Object.keys(env).length} vars).`);

  if (startJob) {
    const jobRaw = run("aws", [
      "amplify",
      "start-job",
      "--app-id",
      amplifyAppId,
      "--branch-name",
      amplifyBranch,
      "--job-type",
      "RELEASE",
      "--region",
      region,
      "--output",
      "json",
    ]);
    const job = JSON.parse(jobRaw);
    console.log(`Started Amplify job: ${job.jobSummary?.jobId ?? "unknown"}`);
  } else {
    console.log("Set AMPLIFY_START_JOB=true to trigger a new build after updating env.");
  }
}

main();
