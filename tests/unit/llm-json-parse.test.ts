import { describe, expect, it } from "vitest";
import { parseInsightCopyFromLlmText } from "@/lib/insights/llmJsonParse";

describe("parseInsightCopyFromLlmText", () => {
  it("parses raw JSON", () => {
    expect(
      parseInsightCopyFromLlmText(`{"headline":"Hi","detail":"There"}`),
    ).toEqual({ headline: "Hi", detail: "There" });
  });

  it("parses fenced json block", () => {
    const raw = '```json\n{"headline":"A","detail":"B"}\n```';
    expect(parseInsightCopyFromLlmText(raw)).toEqual({ headline: "A", detail: "B" });
  });

  it("parses fence without json tag", () => {
    const raw = '```\n{"headline":"X","detail":"Y"}\n```';
    expect(parseInsightCopyFromLlmText(raw)).toEqual({ headline: "X", detail: "Y" });
  });

  it("extracts object from surrounding prose", () => {
    const raw = 'Here you go:\n{"headline":"P","detail":"Q"}\nHope this helps.';
    expect(parseInsightCopyFromLlmText(raw)).toEqual({ headline: "P", detail: "Q" });
  });

  it("returns null for empty usable fields", () => {
    expect(parseInsightCopyFromLlmText('{"headline":"","detail":""}')).toBeNull();
    expect(parseInsightCopyFromLlmText("{}")).toBeNull();
  });

  it("allows headline-only", () => {
    expect(parseInsightCopyFromLlmText('{"headline":"Only"}')).toEqual({
      headline: "Only",
      detail: undefined,
    });
  });

  it("returns null on invalid json", () => {
    expect(parseInsightCopyFromLlmText("not json")).toBeNull();
  });
});
