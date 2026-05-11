import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardAiInsightsHub } from "@/components/v2/insights/DashboardAiInsightsHub";

vi.mock("@/components/AIInsights", () => ({
  AIInsights: () => <div data-testid="coaching-insights-mock">Coaching body</div>,
}));

vi.mock("@/components/v2/photos/PhotoTrackerAiComparePanel", () => ({
  PhotoTrackerAiComparePanel: () => <div data-testid="photo-compare-mock">Photo compare body</div>,
}));

vi.mock("@/components/v2/weeklyReport/WeeklyReportCollapsible", () => ({
  WeeklyReportCollapsible: () => null,
}));

describe("DashboardAiInsightsHub", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders AI insights shell and both collapsible sections", () => {
    render(<DashboardAiInsightsHub />);

    expect(screen.getByRole("heading", { name: "AI insights" })).toBeInTheDocument();
    expect(screen.getByText("Coaching insights")).toBeInTheDocument();
    expect(screen.getAllByText("Photo compare (AI)").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("coaching-insights-mock")).toBeInTheDocument();
    expect(screen.getByTestId("photo-compare-mock")).toBeInTheDocument();
  });
});
