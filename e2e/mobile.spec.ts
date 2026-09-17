import { expect, test } from "@playwright/test";

// SPEC §9.14-12: モバイル（390×844）プロジェクト専用のE2E。
// chromium（user-flows.spec.ts）と同じインメモリのデモDBを共有するため、
// ここでは chromium 側が触らないスポットだけを使う。
//   ...001: シハチ鮮魚店 北24条店（札幌）
//   ...004: 聖徳太子 飛鳥店（小樽）
const SAPPORO_SPOT_ID = "d0000000-0000-4000-8000-000000000001";
const OTARU_SPOT_ID = "d0000000-0000-4000-8000-000000000004";

test.describe("モバイル導線", () => {
  test.describe.configure({ mode: "serial" });

  test("SPEC §9.14-3: 街のページではその街、それ以外は居住街へ（モバイル幅）", async ({ page }) => {
    await page.goto("/otaru");
    await page.getByRole("link", { name: "さがす", exact: true }).click();
    await expect(page).toHaveURL(/\/otaru\/search(?:\?.*)?$/);

    await page.getByRole("link", { name: "栞", exact: true }).click();
    await expect(page).toHaveURL(/\/bookmarks$/);

    await page.getByRole("link", { name: "地図", exact: true }).click();
    await expect(page).toHaveURL(/\/sapporo(?:\?.*)?$/);
  });

  test("SPEC §9.14-16: 実際の地図ピンをタップすると、モバイル相当のホバーカード（下部カード）が開く", async ({
    page,
  }) => {
    await page.goto("/sapporo");
    const pin = page.getByRole("button", { name: /シハチ鮮魚店 北24条店/ });
    await expect(pin).toBeVisible();
    await pin.tap();

    // S2: ピン選択時の下部カード。ホバーカードと同じ情報（店名・一言説明・行動導線）を出す。
    const readLink = page.getByRole("link", { name: "この店を読む" });
    await expect(readLink).toBeVisible();
    const bottomCard = readLink.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' card ')]");
    await expect(bottomCard.getByText("シハチ鮮魚店 北24条店", { exact: true })).toBeVisible();
    await expect(bottomCard.getByText("魚屋の直営。地元の値段のまま、海鮮丼になって出てくる。", { exact: true })).toBeVisible();
  });

  test("ピン選択中も、ズームボタン・栞ボタン・下部カードがほかの要素に覆われずにタップできる", async ({ page }) => {
    await page.goto("/sapporo");
    const pin = page.getByRole("button", { name: /シハチ鮮魚店 北24条店/ });
    await expect(pin).toBeVisible();
    await pin.tap();
    await expect(page.getByRole("link", { name: "この店を読む" })).toBeVisible();

    // 各要素の中心で一番上にある要素が、その要素自身（または子孫）であること。
    const topmost = async (selector: string) =>
      page.locator(selector).first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        return top !== null && el.contains(top);
      });
    expect(await topmost(".maplibregl-ctrl-zoom-in")).toBe(true);
    expect(await topmost(".maplibregl-ctrl-zoom-out")).toBe(true);
    expect(await page.getByRole("link", { name: "栞", exact: true }).first().isVisible()).toBe(true);
    expect(await topmost('main a[aria-label="栞"]')).toBe(true);

    // 実際にズームボタンを押せる（下部カードは閉じない＝地図の背景クリック扱いにならない）。
    await page.locator(".maplibregl-ctrl-zoom-in").tap();
    await expect(page.getByRole("link", { name: "この店を読む" })).toBeVisible();
  });

  test("SPEC §9.14-4/14: タップで栞に挟むと、複数都市それぞれの「地図にまとめる」ボタンに分かれる", async ({
    page,
  }) => {
    // デモの初期データには既に何件か栞があるため、まず全部外してから
    // 札幌1件・小樽1件だけのフレッシュな状態を作る（このファイルはこのテストで終わり）。
    await page.goto("/bookmarks");
    for (let i = 0; i < 10; i += 1) {
      const removeButton = page.getByRole("button", { name: /を栞から外す$/ }).first();
      if (!(await removeButton.isVisible().catch(() => false))) break;
      await removeButton.tap();
      await page.waitForTimeout(50);
    }

    await page.goto(`/sapporo/spots/${SAPPORO_SPOT_ID}`);
    await page.getByRole("button", { name: "栞に挟む" }).tap();
    await expect(page.getByText("栞に挟みました。", { exact: true })).toBeVisible();

    await page.goto(`/otaru/spots/${OTARU_SPOT_ID}`);
    await page.getByRole("button", { name: "栞に挟む" }).tap();
    await expect(page.getByText("栞に挟みました。", { exact: true })).toBeVisible();

    await page.goto("/bookmarks");
    await expect(page.getByRole("link", { name: "札幌の1軒を地図にまとめる" })).toHaveAttribute(
      "href",
      `/sapporo?spots=${SAPPORO_SPOT_ID}`,
    );
    await expect(page.getByRole("link", { name: "小樽の1軒を地図にまとめる" })).toHaveAttribute(
      "href",
      `/otaru?spots=${OTARU_SPOT_ID}`,
    );
  });
});
