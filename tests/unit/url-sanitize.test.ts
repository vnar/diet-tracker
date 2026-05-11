import { describe, expect, it } from "vitest";
import { stripInvisibleFromUrl } from "@/lib/urlSanitize";

describe("stripInvisibleFromUrl", () => {
  it("removes U+2060 word joiner often pasted after URLs", () => {
    const raw = "https://ojas-health.com/\u2060";
    expect(stripInvisibleFromUrl(raw)).toBe("https://ojas-health.com/");
  });

  it("trims BOM and zero-width spaces", () => {
    expect(stripInvisibleFromUrl("\uFEFFhttps://example.com/path\u200B")).toBe(
      "https://example.com/path",
    );
  });
});
