import { describe, expect, it } from "vitest";
import {
  extractJsonObjectFromModelText,
  parseAiInsightStructured,
} from "@/lib/insights/aiInsightStructured";

const base = {
  verdict: {
    status: "at_risk",
    headline: "Headline here",
    detail: "Detail here",
  },
  working: { body: "Working body" },
  stalling: {
    body: "Stall body",
    metrics: [
      { value: "1", label: "a" },
      { value: "2", label: "b" },
      { value: "3", label: "c" },
    ],
  },
  actions: [
    { icon: "walk", action: "Walk", reason: "Move" },
    { icon: "food", action: "Eat", reason: "Fuel" },
    { icon: "moon", action: "Sleep", reason: "Rest" },
  ],
  prediction: { headline: "Pred", basis: "Because" },
};

describe("extractJsonObjectFromModelText", () => {
  it("extracts object when followed by junk", () => {
    const inner = JSON.stringify(base);
    const raw = `Here you go:\n${inner}\n\nHope this helps`;
    expect(extractJsonObjectFromModelText(raw)).toBe(inner);
  });
});

describe("parseAiInsightStructured lenience", () => {
  it("accepts On track verdict label", () => {
    const o = {
      ...base,
      verdict: { ...base.verdict, status: "On track" },
    };
    const r = parseAiInsightStructured(JSON.stringify(o));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.verdict.status).toBe("on_track");
  });

  it("accepts numeric metric values", () => {
    const o = {
      ...base,
      stalling: {
        body: "x",
        metrics: [
          { value: 52, label: "days" },
          { value: "5h", label: "sleep" },
          { value: 16, label: "protein" },
        ],
      },
    };
    const r = parseAiInsightStructured(JSON.stringify(o));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.stalling.metrics[0]?.value).toBe("52");
  });

  it("strips trailing commas before parse", () => {
    const broken = `{"verdict":{"status":"at_risk","headline":"h","detail":"d"},"working":{"body":"w"},"stalling":{"body":"s","metrics":[{"value":"1","label":"a"},]},"actions":[{"icon":"walk","action":"a","reason":"r"},{"icon":"food","action":"a","reason":"r"},{"icon":"moon","action":"a","reason":"r"}],"prediction":{"headline":"p","basis":"b"}}`;
    const r = parseAiInsightStructured(broken);
    expect(r.ok).toBe(true);
  });
});
