/**
 * Product changelog history (newest first). Curated notes for major slices.
 * The **live** row in the footer comes from `buildChangelogForFooter()` (git + Amplify/GitHub CI).
 */
import buildMeta from "./buildMeta.generated.json";

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
};

/** Static history (shown under “This build” on production). */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v1.1.0",
    date: "May 7 2026",
    note:
      "Voice daily log (speech or text → review): colloquial food kcal/protein deltas on Today’s grid, activity line handoff to Energy balance, parse on same AWS Lambda Anthropic key as photo meals.",
    latest: true,
  },
  {
    version: "v1.0.0",
    date: "Mar 21 2026",
    note: "Amplify static hosting pipeline · Initial release",
    latest: false,
  },
  {
    version: "v0.9.0",
    date: "Mar 14 2026",
    note: "Auth flow with Cognito · DynamoDB entries schema",
    latest: false,
  },
];

/**
 * Footer / version panel: prepends the current git build (every Amplify deploy from GitHub).
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
  };
  return [head, ...CHANGELOG.map((e) => ({ ...e, latest: false }))];
}
