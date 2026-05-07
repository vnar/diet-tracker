import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrequentMealsCarousel } from "@/components/v2/meals/FrequentMealsCarousel";

const getMealsListMock = vi.fn();
const postDayMealEntryMock = vi.fn();
const trackMock = vi.fn();

vi.mock("@/lib/frontend-api-client", () => ({
  getMealsList: (...args: unknown[]) => getMealsListMock(...args),
  postDayMealEntry: (...args: unknown[]) => postDayMealEntryMock(...args),
}));

vi.mock("@/lib/analytics", () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

const recent = new Date().toISOString();

describe("FrequentMealsCarousel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMealsListMock.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: "m1",
            name: "Red Apple",
            mealType: "snack" as const,
            estKcal: 95,
            estProteinG: 0,
            timesLogged: 2,
            lastLoggedAt: recent,
          },
        ],
      },
    });
    postDayMealEntryMock.mockResolvedValue({
      ok: true,
      data: {
        entry: {
          id: "e1",
          day: "2026-05-07",
          nameSnapshot: "Red Apple",
          mealType: "snack",
          kcal: 95,
          proteinG: 0,
          loggedAt: "",
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("explains cards must be tapped", async () => {
    render(
      <FrequentMealsCarousel day="2026-05-07" getAccessToken={() => "t"} onLogged={() => {}} />,
    );
    await waitFor(() => expect(screen.getByText(/tap a card/i)).toBeInTheDocument());
  });

  it("calls onLogged and shows flash on success", async () => {
    const onLogged = vi.fn();
    const user = userEvent.setup();
    render(
      <FrequentMealsCarousel day="2026-05-07" getAccessToken={() => "t"} onLogged={onLogged} />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /add red apple/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /add red apple/i }));
    await waitFor(() => {
      expect(postDayMealEntryMock).toHaveBeenCalledWith("2026-05-07", { meal_id: "m1" }, "t");
      expect(onLogged).toHaveBeenCalled();
      expect(screen.getByText(/added: red apple/i)).toBeInTheDocument();
    });
  });

  it("shows error when API fails", async () => {
    postDayMealEntryMock.mockResolvedValueOnce({ ok: false, error: "Meal library is disabled." });
    const user = userEvent.setup();
    render(
      <FrequentMealsCarousel day="2026-05-07" getAccessToken={() => "t"} onLogged={() => {}} />,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /add red apple/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /add red apple/i }));
    await waitFor(() => {
      expect(screen.getByText("Meal library is disabled.")).toBeInTheDocument();
    });
  });
});
