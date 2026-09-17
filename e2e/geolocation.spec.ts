import { expect, test, type Page } from "@playwright/test";

// 重要1・2の回帰E2E（.superpowers/sdd/urasupo/final-review-R8-result.md）。
// 現在地は URL に自動で書き込まない（読み込み直後の別画面への遷移を上書きしないため）ことと、
// 「徒歩10分」がクライアント側で実際に絞り込みとして働くことを検証する。
// 既存 E2E（chromium・mobile）と同じインメモリのデモDBを共有するため、書き込みを伴う操作はしない。
//
// 小樽（otaru）のスポット（デモ用フィクスチャ）:
//   ...004 聖徳太子 飛鳥店   lat 43.1937 lng 140.9989（街中心から約480m）
//   ...005 南樽市場         lat 43.1875 lng 140.9925（街中心から約400m。004からは約860m）
//   ...006 鱗友朝市         lat 43.2004 lng 140.9944（街中心から約1080m）
// 街中心: lat 43.1907 lng 140.9947

const OTARU_CENTER = { latitude: 43.1907, longitude: 140.9947 };
const NEAR_MINAMITARU_MARKET = { latitude: 43.1875, longitude: 140.9925 };

/** 位置情報を許可し、取得結果を1.5秒遅らせる（読み込み直後の遷移を上書きしないかの検証用）。 */
async function grantDelayedGeolocation(page: Page, position: { latitude: number; longitude: number }) {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation(position);
  await page.addInitScript(() => {
    const geolocation = navigator.geolocation;
    const original = geolocation.getCurrentPosition.bind(geolocation);
    geolocation.getCurrentPosition = (success: PositionCallback, error?: PositionErrorCallback | null, options?: PositionOptions) => {
      setTimeout(() => original(success, error ?? undefined, options), 1500);
    };
  });
}

test.describe("現在地の扱い（回帰）", () => {
  test.describe.configure({ mode: "serial" });

  test("重要2: 位置取得中に「さがす」へ移動しても検索画面に留まる（2秒待っても戻されない）", async ({ page }) => {
    await grantDelayedGeolocation(page, OTARU_CENTER);
    await page.goto("/otaru");
    await page.getByRole("link", { name: "さがす", exact: true }).click();
    await expect(page).toHaveURL(/\/otaru\/search(?:\?.*)?$/);
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/otaru\/search(?:\?.*)?$/);
    const url = new URL(page.url());
    expect(url.searchParams.has("lat")).toBe(false);
    expect(url.searchParams.has("lng")).toBe(false);
  });

  test("重要2: 位置取得中に「地図」へ移動しても地図画面に留まる（2秒待っても戻されない）", async ({ page }) => {
    await grantDelayedGeolocation(page, OTARU_CENTER);
    await page.goto("/otaru/search");
    await page.getByRole("link", { name: "地図", exact: true }).click();
    await expect(page).toHaveURL(/\/otaru(?:\?.*)?$/);
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/otaru(?:\?.*)?$/);
    const url = new URL(page.url());
    expect(url.searchParams.has("lat")).toBe(false);
    expect(url.searchParams.has("lng")).toBe(false);
  });

  test("重要1: 現在地の近くだけ「徒歩10分」で絞り込まれる（地図・検索）", async ({ page }) => {
    await page.context().grantPermissions(["geolocation"]);
    await page.context().setGeolocation(NEAR_MINAMITARU_MARKET);

    await page.goto("/otaru");
    await page.getByRole("button", { name: "徒歩10分", exact: true }).click();
    await expect(page.getByRole("link", { name: /南樽市場/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /聖徳太子 飛鳥店/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /鱗友朝市/ })).toHaveCount(0);
    const mapUrl = new URL(page.url());
    expect(mapUrl.searchParams.has("lat")).toBe(false);

    await page.goto("/otaru/search");
    await page.getByRole("button", { name: "徒歩10分", exact: true }).click();
    await expect(page.getByRole("link", { name: /南樽市場/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /聖徳太子 飛鳥店/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /鱗友朝市/ })).toHaveCount(0);
  });

  test("重要1: 位置情報を拒否した状態では街の中心から800m以内だけ「徒歩10分」で絞り込まれる", async ({ page }) => {
    await page.context().clearPermissions();

    await page.goto("/otaru");
    await page.getByRole("button", { name: "徒歩10分", exact: true }).click();
    await expect(page.getByRole("link", { name: /聖徳太子 飛鳥店/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /南樽市場/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /鱗友朝市/ })).toHaveCount(0);

    await page.goto("/otaru/search");
    await page.getByRole("button", { name: "徒歩10分", exact: true }).click();
    await expect(page.getByRole("link", { name: /聖徳太子 飛鳥店/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /南樽市場/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /鱗友朝市/ })).toHaveCount(0);
  });
});
