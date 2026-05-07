import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddFromLibrarySheet } from "@/components/v2/meals/AddFromLibrarySheet";

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

const sampleMeals = [
  {
    id: "meal-uuid-1",
    name: "Chicken Fried Rice",
    mealType: "lunch" as const,
    estKcal: 650,
    estProteinG: 28,
    timesLogged: 3,
  },
  {
    id: "meal-uuid-2",
    name: "Coffee",
    mealType: "breakfast" as const,
    estKcal: 5,
    estProteinG: 0.5,
    timesLogged: 10,
  },
];

describe("AddFromLibrarySheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMealsListMock.mockResolvedValue({ ok: true, data: { items: sampleMeals } });
    postDayMealEntryMock.mockResolvedValue({
      ok: true,
      data: { entry: { id: "e1", day: "2026-05-06", nameSnapshot: "Coffee", mealType: "breakfast", kcal: 5, proteinG: 0.5, loggedAt: "" } },
    });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("shows hint that rows must be tapped to add", async () => {
    const user = userEvent.setup();
    render(
      <AddFromLibrarySheet
        day="2026-05-06"
        getAccessToken={() => "tok"}
        onAdded={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add from library/i }));
    await waitFor(() => {
      expect(screen.getByText(/tap a meal to add it to today/i)).toBeInTheDocument();
    });
  });

  it("keeps sheet open after add and calls onAdded", async () => {
    const onAdded = vi.fn();
    const user = userEvent.setup();
    render(
      <AddFromLibrarySheet
        day="2026-05-06"
        getAccessToken={() => "tok"}
        onAdded={onAdded}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add from library/i }));
    await waitFor(() => expect(screen.getByText("Coffee")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /coffee/i }));
    await waitFor(() => {
      expect(postDayMealEntryMock).toHaveBeenCalledWith(
        "2026-05-06",
        { meal_id: "meal-uuid-2" },
        "tok",
      );
      expect(onAdded).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/added: coffee/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /add from library/i })).toBeInTheDocument();
    expect(screen.getByText("Chicken Fried Rice")).toBeInTheDocument();
  });

  it("shows API error when post fails", async () => {
    postDayMealEntryMock.mockResolvedValueOnce({ ok: false, error: "Meal not found." });
    const user = userEvent.setup();
    render(
      <AddFromLibrarySheet
        day="2026-05-06"
        getAccessToken={() => "tok"}
        onAdded={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /add from library/i }));
    await waitFor(() => expect(screen.getByText("Chicken Fried Rice")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /chicken fried rice/i }));
    await waitFor(() => {
      expect(screen.getByText("Meal not found.")).toBeInTheDocument();
    });
  });
});
