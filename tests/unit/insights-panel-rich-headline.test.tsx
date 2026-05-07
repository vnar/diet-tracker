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
            headline:
              "<b>38 morning weigh-ins</b> Current scale reading is 73 kg. <b>Velocity</b> steady.",
            detail: "",
            why: [],
            action: "",
            category: "trajectory" as const,
            generationSource: "rules" as const,
          },
        ],
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders <b> as strong, not raw angle brackets", async () => {
    render(<InsightsPanel accessToken="token" />);
    await waitFor(() =>
      expect(screen.queryByText(/38 morning weigh-ins/)).toBeInTheDocument(),
    );
    expect(screen.getByText("38 morning weigh-ins").tagName).toBe("STRONG");
    expect(screen.queryByText(/<b>/i)).not.toBeInTheDocument();
  });
});
