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
