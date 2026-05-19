import { describe, expect, it } from "vitest";
import { resolvePhotoWeightKg } from "@/lib/photos/progressPhotoWeight";

describe("resolvePhotoWeightKg", () => {
  const byDate = new Map<string, number>([["2026-05-14", 82.5]]);

  it("prefers stored weightAtPhoto", () => {
    expect(resolvePhotoWeightKg({ date: "2026-05-14", weightAtPhoto: 80 }, byDate)).toBe(80);
  });

  it("falls back to morning weight on the same date", () => {
    expect(resolvePhotoWeightKg({ date: "2026-05-14" }, byDate)).toBe(82.5);
  });

  it("returns undefined when no weight is available", () => {
    expect(resolvePhotoWeightKg({ date: "2026-05-01" }, byDate)).toBeUndefined();
  });
});
