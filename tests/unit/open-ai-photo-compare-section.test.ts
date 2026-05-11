import { afterEach, describe, expect, it } from "vitest";
import { openAiPhotoCompareSection } from "@/lib/openAiPhotoCompareSection";

describe("openAiPhotoCompareSection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("sets details open and does not throw when element missing", () => {
    expect(() => openAiPhotoCompareSection()).not.toThrow();
  });

  it("opens matching details element", () => {
    document.body.innerHTML = `<details id="ai-insights-photo-compare-details"></details>`;
    const el = document.getElementById("ai-insights-photo-compare-details") as HTMLDetailsElement;
    expect(el.open).toBe(false);
    openAiPhotoCompareSection();
    expect(el.open).toBe(true);
  });
});
