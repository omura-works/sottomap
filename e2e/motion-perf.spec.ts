import { expect, test } from "@playwright/test";

// SPEC motion §8.3 の自動の補助: レイアウトのずれ（hadRecentInput を除く layout-shift の合計）が 0.1 以下、
// 見えているページの灯り（.page-lamp）が1つ以下。開発サーバーなので時間の値は見ない（本番条件の数字は perf-after.md）。

for (const path of ["/start", "/sapporo", "/bookmarks"]) {
  test(`${path}: CLS 0.1 以下・見えているページの灯りは1つ以下`, async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
          if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(path);
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls).toBeLessThanOrEqual(0.1);
    const lamps = await page.evaluate(
      () => Array.from(document.querySelectorAll(".page-lamp")).filter((el) => el.getClientRects().length > 0).length,
    );
    expect(lamps).toBeLessThanOrEqual(1);
  });
}
