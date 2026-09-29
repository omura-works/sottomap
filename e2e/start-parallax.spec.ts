import { expect, test } from "@playwright/test";

// SPEC motion §4.4: /start の夜の舞台の視差（スクロール連動）が実際に動く（P3 レビュー重要2 の回帰）。
// .night-card の overflow: hidden がスクロールの箱になると view() の基準が舞台の中になり、まったく動かなかった。
test.describe("トップ画面の視差", () => {
  test("スクロールすると、道と光の層が上へずれる（山並みは舞台の下端が出ていくときにずれる）", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "no-preference", viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto("/start");
    const supported = await page.evaluate(() => CSS.supports("animation-timeline: view()"));
    test.skip(!supported, "animation-timeline: view() に対応していないブラウザ");
    const road = page.locator(".start-par-road");
    await expect(page.locator(".start-hero")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 420));
    await expect
      .poll(async () => road.evaluate((el) => getComputedStyle(el).translate))
      .not.toMatch(/^(none|0px|0px 0px)$/);
    await context.close();
  });

  test("動きを減らす設定では視差を付けない（最終状態のまま）", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto("/start");
    await page.evaluate(() => window.scrollTo(0, 420));
    const translate = await page.locator(".start-par-road").evaluate((el) => getComputedStyle(el).translate);
    expect(translate).toMatch(/^(none|0px|0px 0px)$/);
    await context.close();
  });
});
