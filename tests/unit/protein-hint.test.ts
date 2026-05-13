import { describe, expect, it } from "vitest";
import { suggestProteinHint } from "@/lib/nutrition/proteinHint";

describe("suggestProteinHint", () => {
  it("returns null when sufficient protein", () => {
    expect(suggestProteinHint(95)).toBeNull();
  });

  it("returns hint when below band", () => {
    expect(suggestProteinHint(60)).toContain("60");
  });

  it("returns null for invalid input", () => {
    expect(suggestProteinHint(undefined)).toBeNull();
    expect(suggestProteinHint(Number.NaN)).toBeNull();
  });
});
