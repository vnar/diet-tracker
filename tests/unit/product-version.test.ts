import { describe, expect, it } from "vitest";
import { buildChangelogForFooter, CHANGELOG } from "@/lib/productVersion";

describe("buildChangelogForFooter", () => {
  it("returns static changelog in local dev (stub meta)", () => {
    const rows = buildChangelogForFooter();
    expect(rows.length).toBe(CHANGELOG.length);
    expect(rows.some((r) => r.latest)).toBe(true);
    expect(rows[0]?.version).toBe("v1.1.0");
  });
});
