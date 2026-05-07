import { render, screen, waitFor, within, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FoodPhotoCaloriesAccessory } from "@/components/v2/food/FoodPhotoCaloriesAccessory";

const uploadMock = vi.fn();
const estimateMock = vi.fn();
const confirmMock = vi.fn();
const suggestMatchMock = vi.fn();
const mealCompleteMock = vi.fn();
const trackMock = vi.fn();

vi.mock("@/lib/frontend-api-client", () => ({
  uploadPhotoFile: (...args: unknown[]) => uploadMock(...args),
  postFoodVisionEstimate: (...args: unknown[]) => estimateMock(...args),
  postFoodLogConfirm: (...args: unknown[]) => confirmMock(...args),
  getMealsSuggestMatch: (...args: unknown[]) => suggestMatchMock(...args),
  postFoodMealComplete: (...args: unknown[]) => mealCompleteMock(...args),
  postDayMealEntry: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

describe("FoodPhotoCaloriesAccessory", () => {
  beforeEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.clearAllMocks();
    uploadMock.mockResolvedValue({ ok: true, photoUrl: "s3://photos-bucket/user-1/food/2026-05-05/x.jpg" });
    estimateMock.mockResolvedValue({
      ok: true,
      data: {
        foodLogId: "food#2026-05-05#1#ab",
        estimate: {
          mealLabel: "Soup",
          kcalLow: 180,
          kcalMid: 220,
          kcalHigh: 260,
          proteinG: 10,
          confidence: 0.85,
        },
      },
    });
    confirmMock.mockResolvedValue({ ok: true });
    suggestMatchMock.mockResolvedValue({
      ok: true,
      data: { match: null, similarity: 0 },
    });
    mealCompleteMock.mockResolvedValue({
      ok: true,
      data: { ok: true, entry: {}, libraryMealId: null },
    });
  });

  it("fills calories and protein after confirm; tracks edit when values change", async () => {
    const user = userEvent.setup();
    const setCalories = vi.fn();
    const setProtein = vi.fn();

    const view = render(
      <FoodPhotoCaloriesAccessory
        todayKey="2026-05-05"
        calories=""
        protein=""
        setCalories={setCalories}
        setProtein={setProtein}
        getAccessToken={() => "tok"}
      />,
    );

    await user.click(within(view.container).getByLabelText(/log food from photo/i));
    const input = view.container.querySelector("#food-photo-meal-file") as HTMLInputElement;
    const file = new File(["x"], "meal.jpg", { type: "image/jpeg" });
    await user.upload(input, file);

    await waitFor(() => expect(estimateMock).toHaveBeenCalled());

    const dialog = await screen.findByRole("dialog");
    const protField = within(dialog).getByDisplayValue("10");
    await user.clear(protField);
    await user.type(protField, "15");

    await user.click(within(dialog).getByRole("button", { name: /use values/i }));

    await waitFor(() => {
      expect(setCalories).toHaveBeenCalledWith("220");
      expect(setProtein).toHaveBeenCalledWith("15");
    });

    expect(trackMock).toHaveBeenCalledWith(
      "food_estimate_edited",
      expect.objectContaining({ day: "2026-05-05", foodLogId: "food#2026-05-05#1#ab" }),
    );
    expect(confirmMock).toHaveBeenCalledWith(
      {
        foodLogId: "food#2026-05-05#1#ab",
        confirmedKcal: 220,
        confirmedProtein: 15,
      },
      "tok",
    );
  });

  it("when estimate fails, does not open modal and user can still rely on manual fields", async () => {
    const user = userEvent.setup();
    estimateMock.mockResolvedValueOnce({ ok: false, error: "Vision estimate failed" });

    const setCalories = vi.fn();
    const setProtein = vi.fn();

    const view = render(
      <FoodPhotoCaloriesAccessory
        todayKey="2026-05-05"
        calories=""
        protein=""
        setCalories={setCalories}
        setProtein={setProtein}
        getAccessToken={() => "tok"}
      />,
    );

    await user.click(within(view.container).getByLabelText(/log food from photo/i));
    const input = view.container.querySelector("#food-photo-meal-file") as HTMLInputElement;
    await user.upload(input, new File(["x"], "m.jpg", { type: "image/jpeg" }));

    await waitFor(() => expect(estimateMock).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(setCalories).not.toHaveBeenCalled();
    expect(setProtein).not.toHaveBeenCalled();
  });

  it("refreshes nutrition on corrected dish name save (meal-library flow)", async () => {
    const user = userEvent.setup();
    const setCalories = vi.fn();
    const setProtein = vi.fn();
    suggestMatchMock.mockImplementation(async (q: string) => {
      if (q.trim().toLowerCase() === "mango") {
        return {
          ok: true,
          data: {
            similarity: 1,
            match: {
              id: "m1",
              name: "Mango",
              mealType: "snack",
              estKcal: 95,
              estProteinG: 1,
              estCarbsG: 25,
              estFatG: 0,
              timesLogged: 3,
            },
          },
        };
      }
      return { ok: true, data: { similarity: 0, match: null } };
    });

    const view = render(
      <FoodPhotoCaloriesAccessory
        todayKey="2026-05-05"
        calories=""
        protein=""
        setCalories={setCalories}
        setProtein={setProtein}
        getAccessToken={() => "tok"}
        mealLibraryEnabled
      />,
    );

    await user.click(within(view.container).getByLabelText(/log food from photo/i));
    const input = view.container.querySelector("#food-photo-meal-file") as HTMLInputElement;
    await user.upload(input, new File(["x"], "meal.jpg", { type: "image/jpeg" }));
    const dialog = await screen.findByRole("dialog");
    const rejectQuick = within(dialog).queryByRole("button", { name: /no, this is different/i });
    if (rejectQuick) await user.click(rejectQuick);
    const stableDialog = await screen.findByRole("dialog");
    const dishInput = within(stableDialog).getByLabelText(/dish name/i);
    fireEvent.change(dishInput, { target: { value: "mango" } });
    const rejectQuickAgain = within(await screen.findByRole("dialog")).queryByRole("button", {
      name: /no, this is different/i,
    });
    if (rejectQuickAgain) await user.click(rejectQuickAgain);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /save meal/i }));

    await waitFor(() => {
      expect(suggestMatchMock).toHaveBeenCalledWith("mango", "tok");
      expect(mealCompleteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          dishName: "mango",
          confirmedKcal: 95,
          confirmedProtein: 1,
          carbsG: 25,
          fatG: 0,
        }),
        "tok",
      );
      expect(setCalories).toHaveBeenCalledWith("95");
      expect(setProtein).toHaveBeenCalledWith("1");
    });
  });

  it("does not refresh nutrition when only casing changes", async () => {
    const user = userEvent.setup();
    const view = render(
      <FoodPhotoCaloriesAccessory
        todayKey="2026-05-05"
        calories=""
        protein=""
        setCalories={() => {}}
        setProtein={() => {}}
        getAccessToken={() => "tok"}
        mealLibraryEnabled
      />,
    );

    await user.click(within(view.container).getByLabelText(/log food from photo/i));
    const input = view.container.querySelector("#food-photo-meal-file") as HTMLInputElement;
    await user.upload(input, new File(["x"], "meal.jpg", { type: "image/jpeg" }));
    const dialog = await screen.findByRole("dialog");
    const dishInput = within(dialog).getByDisplayValue("Soup");
    await user.clear(dishInput);
    await user.type(dishInput, "SOUP");
    await user.click(within(dialog).getByRole("button", { name: /save meal/i }));

    await waitFor(() => expect(mealCompleteMock).toHaveBeenCalled());
    expect(suggestMatchMock).not.toHaveBeenCalledWith("SOUP", "tok");
  });

  it("shows graceful error when lookup fails and keeps manual save path", async () => {
    const user = userEvent.setup();
    suggestMatchMock.mockResolvedValueOnce({ ok: false, error: "Network error. Please try again." });

    const view = render(
      <FoodPhotoCaloriesAccessory
        todayKey="2026-05-05"
        calories=""
        protein=""
        setCalories={() => {}}
        setProtein={() => {}}
        getAccessToken={() => "tok"}
        mealLibraryEnabled
      />,
    );

    await user.click(within(view.container).getByLabelText(/log food from photo/i));
    const input = view.container.querySelector("#food-photo-meal-file") as HTMLInputElement;
    await user.upload(input, new File(["x"], "meal.jpg", { type: "image/jpeg" }));
    const dialog = await screen.findByRole("dialog");
    const dishInput = within(dialog).getByDisplayValue("Soup");
    await user.clear(dishInput);
    await user.type(dishInput, "mango");
    await user.click(within(dialog).getByRole("button", { name: /save meal/i }));

    expect(await screen.findByText(/no nutrition match found/i)).toBeInTheDocument();
    expect(mealCompleteMock).not.toHaveBeenCalled();

    // Same corrected name should not trigger repeated lookup attempts.
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /save meal/i }));
    await waitFor(() => expect(mealCompleteMock).toHaveBeenCalled());
    const mangoLookupCalls = suggestMatchMock.mock.calls.filter((c) => c[0] === "mango");
    expect(mangoLookupCalls).toHaveLength(1);
  });
});
