import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FoodPhotoCaloriesAccessory } from "@/components/v2/food/FoodPhotoCaloriesAccessory";

const uploadMock = vi.fn();
const estimateMock = vi.fn();
const confirmMock = vi.fn();
const trackMock = vi.fn();

vi.mock("@/lib/frontend-api-client", () => ({
  uploadPhotoFile: (...args: unknown[]) => uploadMock(...args),
  postFoodVisionEstimate: (...args: unknown[]) => estimateMock(...args),
  postFoodLogConfirm: (...args: unknown[]) => confirmMock(...args),
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
});
