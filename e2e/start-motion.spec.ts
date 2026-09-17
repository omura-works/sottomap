import { expect, test } from "@playwright/test";

// Codex R10 重要3の回帰E2E: SSR・JS実行前の初回描画から
// `prefers-reduced-motion: reduce` が灯りのアニメーションに効くことを検証する。
// 以前は SSR が常に data-motion="playing" を出力し、CSS側の fallback が
// `:not([data-motion])` に限定されていたため、JS実行前（ハイドレーション前）は
// reduced-motion 利用者でも灯りが動き続けていた。
test.describe("トップ画面の reduced-motion 初期描画（回帰: Codex R10 重要3）", () => {
  test("reducedMotion: reduce では、初回表示から灯りのアニメーションが止まっている", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/start");
    const light = page.locator(".start-light").first();
    await expect(light).toBeVisible();
    const animationName = await light.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe("none");
    await context.close();
  });

  test("reducedMotion: reduce かつ JS無効でも、初回表示から灯りのアニメーションが止まっている", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/start");
    const light = page.locator(".start-light").first();
    await expect(light).toBeVisible();
    const animationName = await light.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe("none");
    await context.close();
  });

  test("reducedMotionの指定が無ければ、初回表示で灯りのアニメーションが動いている", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "no-preference" });
    const page = await context.newPage();
    await page.goto("/start");
    const light = page.locator(".start-light").first();
    await expect(light).toBeVisible();
    const animationName = await light.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).not.toBe("none");
    await context.close();
  });
});
