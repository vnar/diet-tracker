#!/usr/bin/env node
/**
 * Fetches recent commits from GitHub REST API and writes lib/githubChangelog.generated.json.
 * Run in Amplify preBuild (after npm ci) so the footer shows real push history, not only hand-curated rows.
 *
 * Repo resolution (first match): GITHUB_REPOSITORY, OJAS_GITHUB_REPO, package.json repository, git remote origin.
 * Auth (optional): GITHUB_TOKEN or GH_TOKEN — recommended for private repos and higher rate limits.
 *
 * @see https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28#list-commits
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "lib", "githubChangelog.generated.json");

const USER_AGENT = "OjasHealth-build/1.0 (+https://github.com/vnar/diet-tracker)";

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", cwd: root, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function repoFromPackageJson() {
  try {
    const raw = readFileSync(join(root, "package.json"), "utf8");
    const pkg = JSON.parse(raw);
    const url = pkg.repository?.url ?? pkg.repository;
    if (typeof url !== "string") return "";
    const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/i);
    return m ? `${m[1]}/${m[2]}` : "";
  } catch {
    return "";
  }
}

function resolveRepoFullName() {
  const gh = process.env.GITHUB_REPOSITORY?.trim();
  if (gh && gh.includes("/")) return gh;
  const explicit = process.env.OJAS_GITHUB_REPO?.trim();
  if (explicit && explicit.includes("/")) return explicit;
  const fromPkg = repoFromPackageJson();
  if (fromPkg) return fromPkg;
  const url = sh("git remote get-url origin 2>/dev/null");
  const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/i);
  return m ? `${m[1]}/${m[2]}` : "";
}

function resolveBranch() {
  return (
    process.env.AWS_BRANCH?.trim() ||
    process.env.GITHUB_REF_NAME?.trim() ||
    process.env.CI_COMMIT_REF_NAME?.trim() ||
    sh("git rev-parse --abbrev-ref HEAD 2>/dev/null") ||
    "main"
  );
}

function firstLine(message) {
  if (typeof message !== "string") return "";
  return message.split("\n")[0].trim().slice(0, 240);
}

async function main() {
  const repoFullName = resolveRepoFullName();
  const branch = resolveBranch();
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  const fetchedAt = new Date().toISOString();

  const empty = (extra = {}) => {
    writeFileSync(
      outPath,
      `${JSON.stringify(
        {
          fetchedAt,
          branch,
          repoFullName,
          commits: [],
          ...extra,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  };

  if (!repoFullName) {
    console.warn("fetch-github-changelog: could not resolve owner/repo; wrote empty commits.");
    empty({ error: "no_repo" });
    return;
  }

  const perPage = Math.min(
    100,
    Math.max(10, Number.parseInt(process.env.OJAS_GITHUB_COMMITS_PER_PAGE || "50", 10) || 50),
  );
  const url = `https://api.github.com/repos/${repoFullName}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}`;

  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": USER_AGENT,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    console.warn("fetch-github-changelog: fetch failed:", e);
    empty({ error: "fetch_failed", repoFullName });
    return;
  }

  const rawText = await res.text();
  if (!res.ok) {
    console.warn(`fetch-github-changelog: GitHub ${res.status} ${rawText.slice(0, 300)}`);
    empty({ error: `http_${res.status}`, repoFullName });
    return;
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    console.warn("fetch-github-changelog: invalid JSON from GitHub");
    empty({ error: "invalid_json", repoFullName });
    return;
  }

  const commits = (Array.isArray(data) ? data : []).map((c) => {
    const sha = typeof c?.sha === "string" ? c.sha : "";
    const msg = c?.commit?.message;
    const d = c?.commit?.author?.date || c?.commit?.committer?.date || "";
    return {
      sha,
      shortSha: sha.slice(0, 7),
      date: typeof d === "string" ? d : "",
      subject: firstLine(msg),
      htmlUrl: typeof c?.html_url === "string" ? c.html_url : "",
    };
  });

  writeFileSync(
    outPath,
    `${JSON.stringify({ fetchedAt, branch, repoFullName, commits }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Wrote ${outPath}: ${commits.length} commits from ${repoFullName}@${branch}`);
}

await main();
