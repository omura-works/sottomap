import { expect, test } from "@playwright/test";

// SPEC motion §5.2.1・§5.3: ピンの判子が地図の位置からずれないこと、「まだ静か」で混みはじめた店が区切りの下へ滑ること。
test.describe("地図のピンと「静かに下がる」", () => {
  test("ピンの見た目の中心は、MapLibre が書いた位置（transform の translate）と一致する", async ({ page }) => {
    await page.goto("/sapporo");
    const pins = page.locator(".map-pin-hit-area");
    await expect(pins.first()).toBeVisible();
    // 判子を押し終わるまで待つ（待っている間は inert）
    await expect(page.locator(".map-pin-hit-area[inert]")).toHaveCount(0, { timeout: 10000 });
    const offsets = await page.evaluate(() => {
      const container = document.querySelector(".maplibregl-canvas-container")!.getBoundingClientRect();
      return Array.from(document.querySelectorAll<HTMLElement>(".map-pin-hit-area")).map((el) => {
        const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(el.style.transform.replace("translate(-50%, -50%) ", ""));
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2 - container.left;
        const cy = r.top + r.height / 2 - container.top;
        return match ? Math.hypot(cx - Number(match[1]), cy - Number(match[2])) : Number.POSITIVE_INFINITY;
      });
    });
    expect(offsets.length).toBeGreaterThan(1);
    for (const d of offsets) expect(d).toBeLessThan(2);
  });

  test("「まだ静か」を付け直すと、混みはじめた店の行が区切りの下へ滑って止まる", async ({ page }) => {
    await page.goto("/sapporo/search");
    const quiet = page.getByRole("button", { name: "まだ静か" });
    await expect(page.getByRole("heading", { level: 2, name: "混みはじめた店" })).toBeVisible();
    await quiet.click();
    await expect(page.getByRole("heading", { level: 2, name: "混みはじめた店" })).toHaveCount(0);
    await page.waitForTimeout(600);

    await quiet.click();
    await expect(page.locator(".spot-rows-sunk")).toBeVisible();
    // 滑っている途中: 下の一覧の行が translate で上（元の位置）から動いている
    const moving = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".spot-rows-sunk > li")).some((li) =>
        li.getAnimations().some((a) => a.playState === "running"),
      ),
    );
    expect(moving).toBe(true);
    await page.waitForTimeout(900);
    const settled = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".spot-rows-sunk > li")).every((li) => li.getAnimations().length === 0),
    );
    expect(settled).toBe(true);
    await expect(page.locator(".spot-rows-sunk")).toContainText("札幌らーめん輝風 すすきの店");
    // 二重に見えない（同じ店の行は見えている物が1つだけ）
    await expect(page.locator("li:visible", { hasText: "札幌らーめん輝風 すすきの店" })).toHaveCount(1);
  });
});
