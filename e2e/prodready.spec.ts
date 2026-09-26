import { expect, test } from "@playwright/test";

// 本番公開前指示書 §6: ヘッダーのE2E（page.request でレスポンスヘッダーを確認）。
test("セキュリティヘッダーが主要なページに付く", async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL}/start`);
  const headers = response.headers();

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("geolocation=(self)");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy-report-only"]).toContain("frame-ancestors 'none'");
  // 開発サーバー（http）では HSTS を出さない（本番のみ）。
  expect(headers["strict-transport-security"]).toBeUndefined();
});

test("/robots.txt が公開ページを許可し、非公開ページを disallow する", async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL}/robots.txt`);
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("Disallow: /me");
  expect(body).toContain("Disallow: /styleguide");
  expect(body).toContain("Sitemap:");
});

test("/sitemap.xml が /start と街のページを含む", async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL}/sitemap.xml`);
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("/start");
  expect(body).toContain("/sapporo");
});

test("地図画面の表示でCSP違反がコンソールに出ない", async ({ page }) => {
  const cspViolations: string[] = [];
  page.on("console", (message) => {
    if (message.text().toLowerCase().includes("content security policy")) {
      cspViolations.push(message.text());
    }
  });

  await page.goto("/sapporo");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // 地図（MapLibre）が描画されるまで少し待つ。
  await page.waitForTimeout(1000);

  expect(cspViolations).toEqual([]);
});

// 2026-09-26 の不具合: レイヤー外の `a { color }` が @layer components の .btn 系に勝ち、
// <a class="btn btn-primary"> の文字が暗くなっていた。<a> と <button> で文字色が同じになることを確認する。
test("ボタンの文字色は <a> でも <button> でも部品の指定どおり", async ({ page }) => {
  await page.goto("/styleguide");
  const colors = await page.evaluate(() => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const result: Record<string, { a: string; button: string }> = {};
    for (const kind of ["btn-primary", "btn-secondary", "btn-ghost"]) {
      const anchor = document.createElement("a");
      anchor.href = "/start";
      anchor.className = `btn ${kind}`;
      anchor.textContent = "リンク";
      const button = document.createElement("button");
      button.type = "button";
      button.className = `btn ${kind}`;
      button.textContent = "ボタン";
      host.append(anchor, button);
      result[kind] = { a: getComputedStyle(anchor).color, button: getComputedStyle(button).color };
    }
    host.remove();
    return result;
  });
  // --color-neutral-100 #f9f4ed / --color-text #2a2622 / --color-accent-700 #8c491a
  expect(colors["btn-primary"]).toEqual({ a: "rgb(249, 244, 237)", button: "rgb(249, 244, 237)" });
  expect(colors["btn-secondary"]).toEqual({ a: "rgb(42, 38, 34)", button: "rgb(42, 38, 34)" });
  expect(colors["btn-ghost"]).toEqual({ a: "rgb(140, 73, 26)", button: "rgb(140, 73, 26)" });
});
