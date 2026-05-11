import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("buildChangelogForFooter + GitHub commits", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/buildMeta.generated.json");
    vi.doUnmock("@/lib/githubChangelog.generated.json");
    vi.resetModules();
  });

  it("inserts GitHub rows after this build and skips the current SHA", async () => {
    vi.doMock("@/lib/buildMeta.generated.json", () => ({
      default: {
        versionLabel: "v9.9.9-test",
        fullDescribe: "v9.9.9-test",
        commitShort: "aaa1111",
        commitFull: "aaa1111000000000000000000000000000000000",
        branch: "main",
        lastCommitSubject: "Current HEAD",
        generatedAt: "2026-05-11T12:00:00.000Z",
      },
    }));
    vi.doMock("@/lib/githubChangelog.generated.json", () => ({
      default: {
        fetchedAt: "2026-05-11T12:00:00.000Z",
        branch: "main",
        repoFullName: "acme/demo",
        commits: [
          {
            sha: "aaa1111000000000000000000000000000000000",
            shortSha: "aaa1111",
            date: "2026-05-11T11:00:00.000Z",
            subject: "Same as HEAD",
            htmlUrl: "https://github.com/acme/demo/commit/aaa",
          },
          {
            sha: "bbb2222000000000000000000000000000000000",
            shortSha: "bbb2222",
            date: "2026-05-10T10:00:00.000Z",
            subject: "Older commit",
            htmlUrl: "https://github.com/acme/demo/commit/bbb",
          },
        ],
      },
    }));

    const { buildChangelogForFooter, CHANGELOG } = await import("@/lib/productVersion");
    const rows = buildChangelogForFooter();

    expect(rows[0]?.latest).toBe(true);
    expect(rows[0]?.version).toBe("v9.9.9-test");
    expect(rows.find((r) => r.version === "aaa1111")).toBeUndefined();
    const older = rows.find((r) => r.version === "bbb2222");
    expect(older).toBeDefined();
    expect(older?.note).toContain("Older commit");
    expect(older?.note).toContain("https://github.com/acme/demo/commit/bbb");
    expect(rows.filter((r) => r.rowKey?.startsWith("milestone-")).length).toBe(CHANGELOG.length);
  });
});
