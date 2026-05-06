import { describe, expect, it } from "vitest";
import { bestLibraryMatch, trigramSimilarity } from "@/lib/meals/fuzzyMatch";
import { nameLookupKey } from "@/lib/meals/nameLookup";

describe("trigramSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(trigramSimilarity("Greek Salad", "Greek Salad")).toBeGreaterThan(0.99);
  });

  it("returns low score for unrelated strings", () => {
    expect(trigramSimilarity("aaa", "zzz")).toBeLessThan(0.2);
  });
});

describe("bestLibraryMatch", () => {
  const lib = [
    { id: "1", name: "Greek Salad with Chicken" },
    { id: "2", name: "Oatmeal" },
    { id: "3", name: "Pad Thai" },
  ];

  it("returns match above threshold", () => {
    const m = bestLibraryMatch("Greek salad w chicken", lib, 0.6);
    expect(m?.meal.id).toBe("1");
  });

  it("returns null when nothing clears threshold", () => {
    const m = bestLibraryMatch("completely different dish", lib, 0.6);
    expect(m).toBeNull();
  });
});

describe("nameLookupKey idempotency", () => {
  it("collapses case and spaces for same user", () => {
    const u = "user-1";
    expect(nameLookupKey(u, "  Greek   Salad ")).toBe(nameLookupKey(u, "greek salad"));
  });
});
