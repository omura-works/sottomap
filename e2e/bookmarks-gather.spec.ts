import { expect, test } from "@playwright/test";

// SPEC motion §5.5: 「地図にまとめる」でアイリスで地図が開き、栞の店のピンにリボンが挟まる（読むだけ。データは変えない）。
test("栞の「地図にまとめる」で地図が開き、栞の店のピンが栞の見た目（リボン）で出る", async ({ page }) => {
  await page.goto("/bookmarks");
  const gather = page.getByRole("link", { name: /を地図にまとめる$/ }).first();
  await expect(gather).toBeVisible();
  await expect(gather).toHaveAttribute("data-lamp-target", "map-button");
  const href = await gather.getAttribute("href");
  await gather.click();
  await page.waitForURL((url) => url.pathname + url.search === href);
  await expect(page.locator(".map-pin-hit-area:not([inert])").first()).toBeVisible({ timeout: 10000 });
  const pins = page.locator(".map-pin-hit-area");
  const count = await pins.count();
  expect(count).toBeGreaterThan(0);
  await expect(page.locator('.map-pin-hit-area[data-bookmarked="true"]')).toHaveCount(count);
  await expect(page.locator(".map-pin-hit-area .pin-ribbon").first()).toBeVisible();
});
