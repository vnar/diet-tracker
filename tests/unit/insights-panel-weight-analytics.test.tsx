import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InsightsPanel } from "@/components/v2/insights/InsightsPanel";

const getInsightsV2Mock = vi.fn();
const trackMock = vi.fn();

vi.mock("@/lib/frontend-api-client", () => ({
  getInsightsV2: (...args: unknown[]) => getInsightsV2Mock(...args),
  submitInsightFeedback: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

vi.mock("@/components/CognitoAuthProvider", () => ({
  useCognitoAuth: () => ({ user: { id: "user-1", email: "a@b.com" }, identityEmailMismatch: null }),
}));

vi.mock("@/lib/featureFlags", () => ({
  isInsightsSourceLabelEnabled: () => false,
}));

describe("InsightsPanel weight trend analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInsightsV2Mock.mockResolvedValue({
      ok: true,
      data: {
        insights: [
          {
            id: "plateau-2026-05-01",
            ruleId: "plateau",
            priority: 93,
            headline: "Steady trend",
            detail: "Pattern in your logs.",
            why: ["a"],
            action: "Keep logging",
            category: "plateau" as const,
            generationSource: "rules" as const,
          },
          {
            id: "other-1",
            ruleId: "streak",
            priority: 50,
            headline: "Nice streak",
            detail: "",
            why: [],
            action: "Continue",
            category: "streak" as const,
            generationSource: "rules" as const,
          },
        ],
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("tracks plateau_alert_viewed when a plateau insight is returned", async () => {
    render(<InsightsPanel accessToken="token" />);
    await waitFor(() => expect(screen.getByText("Steady trend")).toBeInTheDocument());
    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith(
        "plateau_alert_viewed",
        expect.objectContaining({
          insight_id: "plateau-2026-05-01",
          generation_source: "rules",
        }),
      );
    });
  });

  it("still tracks insight_shown for all insights including plateau", async () => {
    render(<InsightsPanel accessToken="token" />);
    await waitFor(() => expect(getInsightsV2Mock).toHaveBeenCalled());
    await waitFor(() => {
      const shown = trackMock.mock.calls.filter((c) => c[0] === "insight_shown");
      expect(shown.length).toBeGreaterThanOrEqual(2);
      expect(shown.some((c) => (c[1] as { category?: string }).category === "plateau")).toBe(
        true,
      );
    });
  });
});
