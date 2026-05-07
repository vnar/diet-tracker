import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InsightsPanel } from "@/components/v2/insights/InsightsPanel";

const getInsightsV2Mock = vi.fn();

vi.mock("@/lib/frontend-api-client", () => ({
  getInsightsV2: (...args: unknown[]) => getInsightsV2Mock(...args),
  submitInsightFeedback: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("@/components/CognitoAuthProvider", () => ({
  useCognitoAuth: () => ({ user: { id: "user-1", email: "a@b.com" } }),
}));

vi.mock("@/lib/featureFlags", () => ({
  isInsightsSourceLabelEnabled: () => false,
}));

describe("InsightsPanel rich headline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInsightsV2Mock.mockResolvedValue({
      ok: true,
      data: {
        insights: [
          {
            id: "ai-1",
            ruleId: "ai_intelligence",
            priority: 100,
            headline: "Legacy headline",
            detail: "",
            why: [],
            action: "",
            category: "trajectory" as const,
            generationSource: "rules" as const,
            structured: {
              verdict: {
                status: "at_risk" as const,
                headline: "38 morning weigh-ins; scale 73 kg. Velocity steady.",
                detail: "Evidence from logs.",
              },
              working: { body: "Logging is consistent." },
              stalling: {
                body: "Pace could improve.",
                metrics: [
                  { value: "3", label: "days" },
                  { value: "6h", label: "sleep" },
                  { value: "80g", label: "protein" },
                ],
              },
              actions: [
                { icon: "walk" as const, action: "Walk", reason: "Move" },
                { icon: "food" as const, action: "Eat protein", reason: "Fuel" },
                { icon: "moon" as const, action: "Sleep", reason: "Recover" },
              ],
              prediction: { headline: "Trend ok by Friday", basis: "Your pattern" },
            },
          },
        ],
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders structured AI card zones", async () => {
    render(<InsightsPanel accessToken="token" />);
    await waitFor(() => {
      expect(screen.getByText("AI analysis")).toBeInTheDocument();
      expect(screen.getByText(/Rate at risk/i)).toBeInTheDocument();
      expect(screen.getByText(/What's working/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/<b>/i)).not.toBeInTheDocument();
  });
});
