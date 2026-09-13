import { expect, test } from "@playwright/test";

const DEMO_VERIFICATION_REQUEST_ID = "80000000-0000-4000-8000-000000000004";

test.describe("デモモードの主要導線", () => {
  test.describe.configure({ mode: "serial" });

  test("街を選び、店の詳細から栞に挟むと栞一覧に表示される", async ({ page }) => {
    await page.goto("/bookmarks");
    const removeExisting = page.getByRole("button", { name: "札幌ザンギ本舗を栞から外す" });
    if (await removeExisting.isVisible()) {
      await removeExisting.click();
      await expect(page.getByText("札幌ザンギ本舗", { exact: true })).toBeHidden();
    }

    await page.goto("/start");
    await page.getByRole("button", { name: "札幌", exact: true }).click();
    await page.getByRole("button", { name: "歩きはじめる" }).click();
    await expect(page).toHaveURL(/\/sapporo(?:\?.*)?$/);

    await page.getByRole("link", { name: /札幌ザンギ本舗/ }).click();
    await expect(page).toHaveURL(/\/sapporo\/spots\/d0000000-0000-4000-8000-000000000002$/);
    await page.getByRole("button", { name: "栞に挟む" }).click();
    await expect(page.getByText("栞に挟みました。", { exact: true })).toBeVisible();

    await page.goto("/bookmarks");
    await expect(page.getByText("札幌ザンギ本舗", { exact: true })).toBeVisible();
  });

  test("承認1件済みのピンは最後の1人の承認で公開される", async ({ page }) => {
    await page.goto("/sapporo/spots/new#pending-spots");
    const pendingCard = page.getByText("北24条の小さな喫茶店", { exact: true }).locator("..").locator("..");

    await expect(pendingCard.getByText("承認 1/2", { exact: true }).first()).toBeVisible();
    await pendingCard.getByRole("button", { name: "行ったことがある", exact: true }).click();
    await expect(page.getByText("2人目の承認で地図に公開されました。", { exact: true })).toBeVisible();

    await page.goto("/sapporo");
    await expect(page.getByRole("link", { name: /北24条の小さな喫茶店/ })).toBeVisible();
  });

  test("同じ確認依頼への再回答ではポイントを加算しない", async ({ browser }) => {
    const context = await browser.newContext();
    const firstPage = await context.newPage();
    const stalePage = await context.newPage();
    const requestPath = `/verify/${DEMO_VERIFICATION_REQUEST_ID}`;

    await Promise.all([firstPage.goto(requestPath), stalePage.goto(requestPath)]);
    await firstPage.getByRole("button", { name: "静かなまま" }).click();
    await expect(firstPage.getByText("+5", { exact: true })).toBeVisible();

    await stalePage.getByRole("button", { name: "静かなまま" }).click();
    await expect(stalePage.getByText("+0", { exact: true })).toBeVisible();
    await context.close();
  });
});
