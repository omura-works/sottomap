import { expect, test } from "@playwright/test";

test("/styleguide がデザインシステムを表示する", async ({ page }) => {
  await page.goto("/styleguide");
  await expect(page.getByRole("heading", { name: "デザインシステム", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "primary" })).toBeVisible();
  await expect(page.getByText("札幌", { exact: true }).first()).toBeVisible();
});

test("/ は /start へリダイレクトされる", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/start$/);
});
