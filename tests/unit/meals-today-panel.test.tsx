import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MealsTodayPanel } from "@/components/v2/meals/MealsTodayPanel";

vi.mock("@/lib/frontend-api-client", () => ({
  deleteDayMealEntry: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}));

describe("MealsTodayPanel", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("renders default heading when heading prop is omitted", () => {
    render(
      <MealsTodayPanel
        day="2026-05-06"
        entries={[
          {
            id: "e1",
            day: "2026-05-06",
            nameSnapshot: "Apple",
            mealType: "snack",
            kcal: 95,
            proteinG: 0,
            loggedAt: "2026-05-06T12:00:00.000Z",
          },
        ]}
        getAccessToken={() => "t"}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText("Meals today")).toBeInTheDocument();
  });

  it("renders custom heading for per-day context", () => {
    render(
      <MealsTodayPanel
        day="2026-05-06"
        heading="Meals for this day"
        entries={[
          {
            id: "e1",
            day: "2026-05-06",
            nameSnapshot: "Apple",
            mealType: "snack",
            kcal: 95,
            proteinG: 0,
            loggedAt: "2026-05-06T12:00:00.000Z",
          },
        ]}
        getAccessToken={() => "t"}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText("Meals for this day")).toBeInTheDocument();
    expect(screen.getByText("Apple")).toBeInTheDocument();
  });

  it("renders empty shell when showWhenEmpty and no entries", () => {
    render(
      <MealsTodayPanel
        day="2026-05-06"
        heading="Meals for this day"
        entries={[]}
        getAccessToken={() => "t"}
        onChanged={() => {}}
        showWhenEmpty
      />,
    );
    expect(screen.getByText("Meals for this day")).toBeInTheDocument();
    expect(screen.getByText(/No meals for this day yet/i)).toBeInTheDocument();
    const panel = screen.getByText("Meals for this day").closest(".shadow-inner");
    expect(panel).toHaveTextContent("0");
    expect(panel).toHaveTextContent("kcal");
  });
});
