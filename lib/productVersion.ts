/**
 * Product changelog history (newest first). Curated milestones plus, on CI builds, GitHub commit history
 * from `lib/githubChangelog.generated.json` (filled by `scripts/fetch-github-changelog.mjs`).
 */
import buildMeta from "./buildMeta.generated.json";
import githubChangelog from "./githubChangelog.generated.json";

export type OjasBuildMeta = {
  versionLabel: string;
  fullDescribe: string;
  commitShort: string;
  commitFull: string;
  branch: string;
  lastCommitSubject: string;
  generatedAt: string;
};

export const OJAS_BUILD_META: OjasBuildMeta = buildMeta as OjasBuildMeta;

/** Shown in footer / About. From git describe on CI; local stub → v0.1.0-dev */
export const OJAS_PRODUCT_VERSION_LABEL =
  buildMeta.commitShort === "local" ? "v0.1.0-dev" : buildMeta.versionLabel;

export type ChangelogEntry = {
  version: string;
  date: string;
  note: string;
  latest: boolean;
  /** Stable key for React lists (short sha, milestone id, etc.) */
  rowKey?: string;
};

export type GithubChangelogCommit = {
  sha: string;
  shortSha: string;
  date: string;
  subject: string;
  htmlUrl: string;
};

type GithubChangelogFile = {
  fetchedAt?: string;
  branch?: string;
  repoFullName?: string;
  commits?: GithubChangelogCommit[];
};

const githubFile = githubChangelog as GithubChangelogFile;

function formatGithubCommitDate(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function githubRowsForFooter(currentCommitFull: string, currentShort: string): ChangelogEntry[] {
  const commits = githubFile.commits ?? [];
  if (commits.length === 0) return [];

  const cur = (currentCommitFull || currentShort).trim().toLowerCase();
  const curShort = currentShort.trim().toLowerCase();

  return commits
    .filter((c) => {
      const sha = (c.sha || "").toLowerCase();
      const short = (c.shortSha || "").toLowerCase();
      if (!sha && !short) return false;
      if (cur && (sha === cur || sha.startsWith(cur) || short === curShort)) return false;
      return true;
    })
    .map((c) => {
      const link = c.htmlUrl ? ` · ${c.htmlUrl}` : "";
      return {
        version: c.shortSha || c.sha.slice(0, 7),
        date: formatGithubCommitDate(c.date),
        note: `${c.subject || "(no subject)"}${link}`,
        latest: false,
        rowKey: `gh-${c.sha || c.shortSha}`,
      };
    });
}

/** Product milestones (shown after live + GitHub rows on production builds). */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v1.1.0",
    date: "May 7 2026",
    note:
      "Voice daily log (speech or text → review): colloquial food kcal/protein deltas on Today’s grid, activity line handoff to Energy balance, parse on same AWS Lambda Anthropic key as photo meals.",
    latest: true,
    rowKey: "milestone-v1.1.0",
  },
  {
    version: "v1.0.0",
    date: "Mar 21 2026",
    note: "Amplify static hosting pipeline · Initial release",
    latest: false,
    rowKey: "milestone-v1.0.0",
  },
  {
    version: "v0.9.0",
    date: "Mar 14 2026",
    note: "Auth flow with Cognito · DynamoDB entries schema",
    latest: false,
    rowKey: "milestone-v0.9.0",
  },
];

/**
 * Footer / version panel: current build, then GitHub commits (when `githubChangelog.generated.json`
 * was filled at build time), then milestone copy.
 * Local dev (`commitShort === "local"`) returns static CHANGELOG only.
 */
export function buildChangelogForFooter(): ChangelogEntry[] {
  if (buildMeta.commitShort === "local") {
    return CHANGELOG;
  }
  const dt = new Date(buildMeta.generatedAt);
  const dateStr = Number.isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const parts = [`branch ${buildMeta.branch}`, `commit ${buildMeta.commitShort}`];
  if (buildMeta.lastCommitSubject) parts.push(buildMeta.lastCommitSubject);
  if (buildMeta.fullDescribe && buildMeta.fullDescribe !== buildMeta.versionLabel) {
    parts.push(`describe ${buildMeta.fullDescribe}`);
  }

  const head: ChangelogEntry = {
    version: buildMeta.versionLabel,
    date: dateStr,
    note: parts.join(" · "),
    latest: true,
    rowKey: `build-${buildMeta.commitShort}`,
  };

  const gh = githubRowsForFooter(buildMeta.commitFull, buildMeta.commitShort);
  const milestones = CHANGELOG.map((e) => ({ ...e, latest: false }));

  if (gh.length === 0) {
    return [head, ...milestones];
  }

  return [head, ...gh, ...milestones];
}
