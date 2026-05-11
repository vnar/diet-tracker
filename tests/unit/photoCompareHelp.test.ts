import { describe, expect, it } from "vitest";
import { PHOTO_COMPARE_INSTRUCTIONS } from "@/lib/photoCompareHelp";

describe("PHOTO_COMPARE_INSTRUCTIONS", () => {
  it("states non-medical scope", () => {
    expect(PHOTO_COMPARE_INSTRUCTIONS).toContain("not medical advice");
  });

  it("mentions selection and where to review", () => {
    expect(PHOTO_COMPARE_INSTRUCTIONS).toContain("Select");
    expect(PHOTO_COMPARE_INSTRUCTIONS).toContain("Photo compare");
  });
});
