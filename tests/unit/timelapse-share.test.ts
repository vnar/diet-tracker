import { describe, expect, it } from "vitest";
import { buildTimelapseSharePageUrl } from "@/lib/share/timelapseShare";

describe("timelapse share", () => {
  it("builds share page URL from share id", () => {
    expect(buildTimelapseSharePageUrl("abc123", "https://ojas-health.com")).toBe(
      "https://ojas-health.com/share?t=abc123",
    );
  });
});
