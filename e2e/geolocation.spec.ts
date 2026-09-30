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

  // Codex R9 重要1: 明示的なlat/lng付きURLでは、その座標だけを基準に絞り込む
  // （サーバーの基準点と閲覧者の現在地の積集合にならない）。
  test("重要1(R9): 明示的なlat/lng付きURLは、その座標だけを基準に絞り込まれる", async ({ page }) => {
    await page.context().grantPermissions(["geolocation"]);
    // 閲覧者の現在地は南樽市場付近（聖徳太子 飛鳥店から約860m。従来はここで積集合が0件になっていた）。
    await page.context().setGeolocation(NEAR_MINAMITARU_MARKET);

    const shofutaishiOrigin = "lat=43.1937&lng=140.9989"; // 聖徳太子 飛鳥店自身の座標
    await page.goto(`/otaru/search?filters=within-10min&${shofutaishiOrigin}`);
    await expect(page.getByRole("link", { name: /聖徳太子 飛鳥店/ })).toBeVisible();
    // Codex R10 軽微2: 閲覧者の現在地（南樽市場付近）側の店は、URL座標基準では除外される
    // （現在地との積集合になっていないことの否定検証）。
    await expect(page.getByRole("link", { name: /南樽市場/ })).toHaveCount(0);

    await page.goto(`/otaru?filters=within-10min&${shofutaishiOrigin}`);
    await expect(page.getByRole("link", { name: /聖徳太子 飛鳥店/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /南樽市場/ })).toHaveCount(0);
  });

  // Codex R9 重要2: 位置解決中は結果一覧の代わりに待機文言を出し、解決後に件数を通知する。
  test("重要2(R9): 位置取得中は見出しが「いまいる場所をたしかめています…」、解決後は件数が確定する", async ({ page }) => {
    await grantDelayedGeolocation(page, OTARU_CENTER);

    await page.goto("/otaru/search?filters=within-10min");
    await expect(page.getByRole("heading", { level: 1, name: "いまいる場所をたしかめています…" })).toBeVisible();

    await page.waitForTimeout(2000);
    await expect(page.getByRole("heading", { level: 1, name: "いまいる場所をたしかめています…" })).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText(/軒見つかりました|条件に合う店が見つかりませんでした。/);
  });

  // Codex R10/R11 条件: 位置解決の前後で、実ブラウザのフォーカスが検索欄から奪われない。
  test("重要2(R10): 位置取得中に検索欄へフォーカスしていれば、解決後もフォーカスは検索欄のまま", async ({ page }) => {
    await grantDelayedGeolocation(page, OTARU_CENTER);

    await page.goto("/otaru/search?filters=within-10min");
    await expect(page.getByRole("heading", { level: 1, name: "いまいる場所をたしかめています…" })).toBeVisible();
    const searchbox = page.getByRole("searchbox", { name: "小樽の店をさがす" });
    await searchbox.focus();
    await expect(searchbox).toBeFocused();

    await expect(page.getByRole("heading", { level: 1, name: "いまいる場所をたしかめています…" })).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByRole("status")).toHaveText(/軒見つかりました|条件に合う店が見つかりませんでした。/);
    await expect(searchbox).toBeFocused();
    await expect(page.getByRole("heading", { level: 1 })).not.toBeFocused();
  });

  // Codex R9 重要5: 検索欄に入力した直後（300ms以内）に別画面へ移動しても、後から検索URLへ戻されない。
  test("重要5(R9): 検索入力直後に「地図」へ移動しても地図画面に留まる", async ({ page }) => {
    await page.goto("/otaru/search");
    await page.getByRole("searchbox", { name: "小樽の店をさがす" }).fill("市場");
    await page.getByRole("link", { name: "地図", exact: true }).click();

    await expect(page).toHaveURL(/\/otaru(?:\?.*)?$/);
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/otaru(?:\?.*)?$/);
  });

  // Codex R10 重要1: pathnameガードだけでは不十分（Next.js 16 は router state のコミット時に
  // URLを更新するため、遷移先の描画（RSCレスポンス）が遅れている間はpathnameが検索画面のまま
  // になり得る）。300msのデバウンスを超えて遷移が未コミットのままでも、検索URLへ戻されない
  // ことを、遷移先（地図）のRSCリクエストを1.5秒遅延させて検証する。
  test("重要1(R10): 遷移先の描画が遅れても（300ms超）、検索入力直後の地図への遷移が検索URLへ戻されない", async ({ page }) => {
    await page.goto("/otaru/search");

    let delayedRequests = 0;
    await page.route("**/*", async (route) => {
      const request = route.request();
      const headers = request.headers();
      const url = new URL(request.url());
      const isRscRequest = headers["rsc"] === "1" || url.searchParams.has("_rsc");
      const isMapTarget = url.pathname === "/otaru";
      if (isRscRequest && isMapTarget) {
        delayedRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.continue();
    });

    await page.getByRole("searchbox", { name: "小樽の店をさがす" }).fill("市場");
    await page.getByRole("link", { name: "地図", exact: true }).click();

    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/otaru(?:\?.*)?$/);
    const url = new URL(page.url());
    expect(url.searchParams.has("q")).toBe(false);
    // Codex R11: 遅延の分岐が実際に通ったこと（遷移先のRSCが遅延されたこと）を確認する。
    expect(delayedRequests).toBeGreaterThan(0);
  });
});
