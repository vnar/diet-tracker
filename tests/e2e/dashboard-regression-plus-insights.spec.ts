import { expect, test } from "@playwright/test";

test.describe("dashboard regression plus insights", () => {
  test("save shows up in history and chart remains visible", async ({ page }) => {
    await page.goto("/");

    const morningWeight = page.getByLabel(/morning weight/i);
    await morningWeight.fill("79.8");
    await page.getByRole("button", { name: /save today|update today/i }).click();

    await expect(page.getByText("Saved")).toBeVisible();
    await expect(page.getByRole("heading", { name: /weight trend/i })).toBeVisible();

    const historyToggle = page
      .locator("button")
      .filter({ has: page.getByRole("heading", { name: "History" }) });
    await historyToggle.click();

    await expect(page.getByRole("columnheader", { name: "Date" })).toBeVisible();
    await expect(page.getByLabel(/Morning weight \d{4}-\d{2}-\d{2}/)).toHaveValue("79.8");
  });

  test("insights card renders safe empty state when no insights", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Insights" })).toBeVisible();
    await expect(page.getByText("No nudges right now — keep logging.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Helpful insight/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Not helpful insight/i })).toHaveCount(0);
  });
});
