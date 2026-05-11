#!/usr/bin/env node
/**
 * Writes lib/buildMeta.generated.json from the current git checkout.
 * Run in Amplify preBuild (after npm ci) so every GitHub push shows correct version + commit.
 *
 * Uses git describe for semver-ish labels when you use annotated tags (git tag -a v1.2.0).
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "lib", "buildMeta.generated.json");

function sh(cmd) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

// Amplify: AWS_BRANCH, AWS_COMMIT_ID (https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html)
// GitHub Actions: GITHUB_REF_NAME, GITHUB_SHA
const branch =
  process.env.AWS_BRANCH?.trim() ||
  process.env.GITHUB_REF_NAME?.trim() ||
  process.env.CI_COMMIT_REF_NAME?.trim() ||
  "local";

// Shallow clones often miss tags; best-effort widen history for describe.
sh("git rev-parse --is-shallow-repository 2>/dev/null | grep -q true && git fetch --tags --unshallow 2>/dev/null || true");
sh("git fetch --tags --force --depth=200 2>/dev/null || true");
sh("git fetch --tags --force 2>/dev/null || true");

const commitFull =
  process.env.AWS_COMMIT_ID?.trim() ||
  process.env.GITHUB_SHA?.trim() ||
  process.env.READ_COMMIT_SHA?.trim() ||
  sh("git rev-parse HEAD");

const commitShort = commitFull ? commitFull.slice(0, 7) : sh("git rev-parse --short HEAD") || "unknown";

const exactTag = sh("git describe --tags --exact-match 2>/dev/null");
const describe = sh("git describe --tags --always --long 2>/dev/null") || commitShort;
/** Prefer exact semver tag; else describe (e.g. v1.1.0-3-gabcdef) */
const versionLabel = exactTag || describe || commitShort;

const lastCommitSubject = sh("git log -1 --pretty=%s") || "";

const meta = {
  versionLabel,
  fullDescribe: describe,
  commitShort,
  commitFull: commitFull || "",
  branch,
  lastCommitSubject: lastCommitSubject.slice(0, 200),
  generatedAt: new Date().toISOString(),
};

writeFileSync(outPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}: ${versionLabel} (${commitShort} ${branch})`);
