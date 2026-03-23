import { expect, test } from "@playwright/test";

test.describe("PQ regression", () => {
  test("daily entry persists after reload in local mode", async ({ page }) => {
    await page.goto("/");

    const morningWeight = page.getByLabel(/morning weight/i);
    await morningWeight.fill("79.2");
    await page.getByRole("button", { name: /save today/i }).click();

    await expect(page.getByText("Saved")).toBeVisible();
    await expect(page.getByRole("button", { name: /update today/i })).toBeVisible();

    await page.reload();

    await expect(page.getByLabel(/morning weight/i)).toHaveValue("79.2");
    await expect(page.getByRole("button", { name: /update today/i })).toBeVisible();
  });

  test("daily habits labels render in full", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Daily habits")).toBeVisible();
    await expect(page.getByText("Workout")).toBeVisible();
    await expect(page.getByText("Alcohol")).toBeVisible();
    await expect(page.getByText("Late snack")).toBeVisible();
    await expect(page.getByText("High sodium")).toBeVisible();
  });
});
