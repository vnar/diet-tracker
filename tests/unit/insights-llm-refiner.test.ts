import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/featureFlags", () => ({
  isInsightsLlmRefineEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/insights/cacheStore", () => ({
  getInsightCache: vi.fn(),
  putInsightCache: vi.fn(),
  incrementLlmUsage: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      create: vi.fn(async () => ({
        content: [{ type: "text", text: JSON.stringify({ headline: "Warm headline", detail: "Warm detail" }) }],
      })),
    };
  },
}));

import { isInsightsLlmRefineEnabled } from "@/lib/featureFlags";
import { maybeRefineInsight } from "@/lib/insights/llmRefiner";
import {
  getInsightCache,
  incrementLlmUsage,
  putInsightCache,
} from "@/lib/insights/cacheStore";

const baseInsight = {
  id: "plateau-2026-01-01",
  ruleId: "plateau",
  priority: 90,
  headline: "Original headline",
  detail: "Original detail",
  why: ["Point"],
  action: "Do this",
  category: "plateau" as const,
};

describe("insights llm refiner", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.mocked(getInsightCache).mockResolvedValue(null);
    vi.mocked(incrementLlmUsage).mockResolvedValue(1);
  });

  it("returns cached insight without calling model", async () => {
    vi.mocked(getInsightCache).mockResolvedValue({ ...baseInsight, headline: "Cached" });
    const result = await maybeRefineInsight(baseInsight, { userId: "u1" });
    expect(result.headline).toBe("Cached");
    expect(result.generationSource).toBe("llm");
  });

  it("returns raw output when daily cap exceeded", async () => {
    vi.mocked(incrementLlmUsage).mockResolvedValue(101);
    const result = await maybeRefineInsight(baseInsight, { userId: "u1" });
    expect(result.headline).toBe("Original headline");
    expect(result.generationSource).toBe("rules");
  });

  it("tags rules when refine flag is off", async () => {
    vi.mocked(isInsightsLlmRefineEnabled).mockReturnValueOnce(false);
    const result = await maybeRefineInsight(baseInsight, { userId: "u1" });
    expect(result.generationSource).toBe("rules");
  });

  it("caches refined output when model succeeds", async () => {
    const result = await maybeRefineInsight(baseInsight, {
      userId: "u1",
      firstName: "Vi",
      tone: "friendly",
      recentNotes: ["Had a late snack"],
    });
    expect(result.headline).toBe("Warm headline");
    expect(result.generationSource).toBe("llm");
    expect(putInsightCache).toHaveBeenCalled();
  });
});
