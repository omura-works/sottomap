import { expect, test } from "@playwright/test";

// SPEC motion §7.1・§7.2-3: /start の画面の外の節は最初の描画の後に描くが、JS 本体が遅くても
// （<head> のインラインスクリプトが外すので）すぐに描かれ、読み上げの木にも出る。
test("JS 本体を6秒遅らせても、画面の外の節は最初の描画の直後に描かれ読み上げの木に出る", async ({ page, context }) => {
  await page.route(/\/_next\/static\/.*\.js/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    await route.continue();
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Accessibility.enable");
  await page.goto("/start", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).not.toHaveAttribute("data-defer-below", { timeout: 3000 });
  const tree = await cdp.send("Accessibility.getFullAXTree");
  const names = tree.nodes.filter((node) => !node.ignored).map((node) => node.name?.value ?? "");
  expect(names).toContain("静かな店を、静かなままに");
});
