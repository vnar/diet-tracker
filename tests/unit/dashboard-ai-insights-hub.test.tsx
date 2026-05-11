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
  WeeklyReportCollapsible: () => <div data-testid="weekly-report-mock" />,
}));

describe("DashboardAiInsightsHub", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders Insights card with coaching, photo compare, and weekly recap slot", () => {
    render(<DashboardAiInsightsHub />);

    expect(screen.getByRole("heading", { name: "Insights" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Weekly recap" })).not.toBeInTheDocument();
    expect(screen.getByText("Coaching")).toBeInTheDocument();
    expect(screen.getAllByText("Photo compare").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("coaching-insights-mock")).toBeInTheDocument();
    expect(screen.getByTestId("photo-compare-mock")).toBeInTheDocument();
    expect(screen.getByTestId("weekly-report-mock")).toBeInTheDocument();
  });
});
