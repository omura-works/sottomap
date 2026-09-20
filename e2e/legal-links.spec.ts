import { expect, test } from "@playwright/test";

/**
 * 指示書 pages-c-brief.md: フッターの導線・/shops・店舗詳細からの導線。
 * リンク先ページ（/terms・/privacy・/faq・/contact）は別エージェントが作成中のため、
 * ここではリンクの存在と href だけを確認する（遷移先の内容は確認しない）。
 */
test("一覧ページのフッターに利用規約・プライバシーポリシー・よくある質問・お問い合わせ・掲載店舗の方への導線がある", async ({
  page,
}) => {
  await page.goto("/sapporo/search");
  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "利用規約" })).toHaveAttribute("href", "/terms");
  await expect(footer.getByRole("link", { name: "プライバシーポリシー" })).toHaveAttribute("href", "/privacy");
  await expect(footer.getByRole("link", { name: "よくある質問" })).toHaveAttribute("href", "/faq");
  await expect(footer.getByRole("link", { name: "お問い合わせ" })).toHaveAttribute("href", "/contact");
  await expect(footer.getByRole("link", { name: "掲載店舗の方へ" })).toHaveAttribute("href", "/shops");
});

test("地図（街トップ）にはフッターを出さない", async ({ page }) => {
  await page.goto("/sapporo");
  await expect(page.locator("footer")).toHaveCount(0);
});

test("/shops「掲載店舗の方へ」が表示され、掲載を止める導線が /contact を指す", async ({ page }) => {
  await page.goto("/shops");
  await expect(page.getByRole("heading", { name: "掲載店舗の方へ", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "お問い合わせ" }).first()).toHaveAttribute("href", "/contact");
});

test("店舗詳細から「この店の情報について」で /contact?spot=<id> へ導線がある", async ({ page }) => {
  await page.goto("/sapporo/search");
  await page.getByRole("link", { name: /札幌ザンギ本舗/ }).first().click();
  await expect(page).toHaveURL(/\/sapporo\/spots\//);
  const spotLink = page.getByRole("link", { name: "この店の情報について" });
  await expect(spotLink).toBeVisible();
  const href = await spotLink.getAttribute("href");
  expect(href).toMatch(/^\/contact\?spot=.+/);
});
