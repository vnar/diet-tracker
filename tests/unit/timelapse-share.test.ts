import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildTimelapseSharePageUrl,
  getTimelapseShareAudioSrc,
  getTimelapseSharePublicOrigin,
  resolveTimelapseSharePageUrl,
} from "@/lib/share/timelapseShare";
import { resolvePublicAppBaseUrl, sanitizePublicAppUrl } from "@/lib/share/publicAppUrl";

describe("timelapse share", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves bundled audio with cache-bust version", () => {
    expect(getTimelapseShareAudioSrc()).toBe("/audio/timelapse-share.mp3?v=champion");
  });

  it("builds share page URL from share id", () => {
    expect(buildTimelapseSharePageUrl("abc123", "https://ojas-health.com")).toBe(
      "https://ojas-health.com/share?t=abc123",
    );
  });

  it("rewrites localhost API URLs to canonical production origin", () => {
    vi.stubGlobal("window", { location: { hostname: "localhost", origin: "http://localhost:3000" } });
    expect(
      resolveTimelapseSharePageUrl(
        "abc123",
        "http://localhost:3000/share?t=abc123",
      ),
    ).toBe("https://ojas-health.com/share?t=abc123");
  });

  it("uses current origin on production host", () => {
    vi.stubGlobal("window", {
      location: { hostname: "ojas-health.com", origin: "https://ojas-health.com" },
    });
    expect(getTimelapseSharePublicOrigin()).toBe("https://ojas-health.com");
    expect(
      resolveTimelapseSharePageUrl(
        "tok",
        "http://localhost:3000/share?t=tok",
      ),
    ).toBe("https://ojas-health.com/share?t=tok");
  });
});

describe("publicAppUrl", () => {
  it("drops localhost from deploy candidates", () => {
    expect(sanitizePublicAppUrl("http://localhost:3000")).toBe("");
    expect(resolvePublicAppBaseUrl("http://localhost:3000", "")).toBe("https://ojas-health.com");
    expect(resolvePublicAppBaseUrl("https://ojas-health.com")).toBe("https://ojas-health.com");
  });
});
