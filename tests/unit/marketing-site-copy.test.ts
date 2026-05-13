import { describe, expect, it } from "vitest";
import {
  MARKETING_DEFAULT_METADATA,
  MARKETING_GUIDES,
  getMarketingGuide,
  listMarketingGuideSlugs,
} from "@/lib/marketing/siteCopy";

describe("marketing site copy", () => {
  it("lists three SEO guides with unique slugs", () => {
    const slugs = listMarketingGuideSlugs();
    expect(slugs).toHaveLength(3);
    expect(new Set(slugs).size).toBe(3);
    expect(slugs).toContain("photo-meal-calorie-log");
  });

  it("returns guide content by slug", () => {
    const guide = getMarketingGuide("simple-weight-trend-log");
    expect(guide.path).toBe("/guides/simple-weight-trend-log");
    expect(guide.title.length).toBeGreaterThan(10);
    expect(guide.sections.length).toBeGreaterThanOrEqual(2);
  });

  it("throws for unknown guide slug", () => {
    expect(() => getMarketingGuide("not-a-guide" as never)).toThrow(/Unknown marketing guide/);
  });

  it("exposes default metadata for layout", () => {
    expect(MARKETING_DEFAULT_METADATA.title).toMatch(/morning weigh-in/i);
    expect(MARKETING_GUIDES.every((g) => g.description.length > 20)).toBe(true);
  });
});
