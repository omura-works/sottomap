import { expect, test } from "@playwright/test";

// デモ利用者（Aさん・札幌在住）宛ての確認依頼。Spec §9.13.3 に合わせてフィクスチャ（デモモード専用の札幌の架空店）を用意してある。
//   ...08: 大通の小さな定食屋。期限（due_at）を過ぎた open → 回答できる
//   ...09: 大通の古い蕎麦屋。期限前の open → 回答フォームを出さない
const DEMO_VERIFICATION_REQUEST_ID = "80000000-0000-4000-8000-000000000008";
const NOT_YET_DUE_REQUEST_ID = "80000000-0000-4000-8000-000000000009";

test.describe("デモモードの主要導線", () => {
  test.describe.configure({ mode: "serial" });

  test("街を選び、店の詳細から栞に挟むと栞一覧に表示される", async ({ page }) => {
    await page.goto("/bookmarks");
    const removeExisting = page.getByRole("button", { name: "札幌ザンギ本舗を栞から外す" });
    if (await removeExisting.isVisible()) {
      // ConfirmRemoveButton: 押すとその場で確定パネル（外す／やめる）が開く。「外す」で確定する。
      await removeExisting.click();
      await page.getByRole("button", { name: "外す", exact: true }).click();
      await expect(page.getByText("札幌ザンギ本舗", { exact: true })).toBeHidden();
    }

    await page.goto("/start");
    await page.getByRole("button", { name: "札幌", exact: true }).click();
    await page.getByRole("button", { name: "札幌を歩いてみる" }).click();
    await expect(page).toHaveURL(/\/sapporo(?:\?.*)?$/);

    // 店リンクは D1（lg:以上）のサイドバーにしかないため、モバイル幅でも安定させるため
    // 既知のスポットIDへ直接遷移する（S2/D1どちらでも同じ詳細ページに到達する導線の検証）。
    await page.goto("/sapporo/spots/d0000000-0000-4000-8000-000000000002");
    await page.getByRole("button", { name: "栞に挟む" }).click();
    await expect(page.getByText("栞に挟みました。", { exact: true })).toBeVisible();

    await page.goto("/bookmarks");
    await expect(page.getByText("札幌ザンギ本舗", { exact: true })).toBeVisible();
  });

  test("承認1件済みのピンは最後の1人の承認で公開される", async ({ page }) => {
    await page.goto("/sapporo/spots/new#pending-spots");
    const pendingCard = page.getByText("北24条の小さな喫茶店", { exact: true }).locator("..").locator("..");

    await expect(pendingCard.getByText("承認 1/2", { exact: true }).first()).toBeVisible();
    await pendingCard.getByRole("button", { name: "行ったことがある", exact: true }).click();
    await expect(page.getByText("2人目の承認で地図に公開されました。", { exact: true })).toBeVisible();

    // 地図ピン（role="button"）はモバイル（全面地図）・デスクトップ（右ペイン）どちらでも
    // 常に描画される。D1サイドバーのリンク（lg:以上のみ）ではなくピンで公開を確認する。
    await page.goto("/sapporo");
    await expect(page.getByRole("button", { name: /北24条の小さな喫茶店/ })).toBeVisible();
  });

  test("期限前の確認依頼には回答フォームを出さず、確認待ちにも数えない", async ({ page }) => {
    await page.goto(`/verify/${NOT_YET_DUE_REQUEST_ID}`);
    await expect(page.getByText("大通の古い蕎麦屋", { exact: true })).toBeVisible();
    await expect(page.getByText(/^次の確認は\d{1,2}月\d{1,2}日に届きます。$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "静かなまま" })).toHaveCount(0);

    // 期限到来済みの ...08 だけが「確認待ち」。
    await page.goto("/me");
    await expect(page.getByRole("heading", { name: "確認待ちが1件あります" })).toBeVisible();
  });

  test("R13 重要2: /me の確認ダイアログはモーダル（Tab を繰り返しても外へ出ない・Esc で閉じて起点へ戻る）", async ({ page }) => {
    await page.goto("/me");
    await page.getByRole("button", { name: "変更する", exact: true }).click();
    await page.getByLabel("住んでいる街を選ぶ").selectOption({ label: "小樽" });
    const opener = page.getByRole("button", { name: "変える", exact: true });
    await opener.click();

    const dialog = page.getByRole("dialog", { name: /^住んでいる街を小樽に変えますか。次に変えられるのは/ });
    await expect(dialog).toBeVisible();
    // showModal() で開いている（背景はブラウザが操作不可にする）
    await expect(page.locator("dialog:modal")).toHaveCount(1);
    // 初期フォーカスは破壊的な「変える」ではなく「やめる」
    await expect(dialog.getByRole("button", { name: "やめる" })).toBeFocused();

    const focusedInsideDialog = () =>
      page.evaluate(() => {
        const modal = document.querySelector("dialog");
        const active = document.activeElement;
        return {
          inside: Boolean(modal && active && active !== modal && modal.contains(active)),
          label: active?.textContent?.trim() ?? "",
        };
      });

    const forward: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("Tab");
      const state = await focusedInsideDialog();
      expect(state.inside, `Tab ${i + 1} 回目`).toBe(true);
      forward.push(state.label);
    }
    // 2つのボタンの間を循環する
    expect(forward).toEqual(["変える", "やめる", "変える", "やめる", "変える"]);

    const backward: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("Shift+Tab");
      const state = await focusedInsideDialog();
      expect(state.inside, `Shift+Tab ${i + 1} 回目`).toBe(true);
      backward.push(state.label);
    }
    expect(backward).toEqual(["やめる", "変える", "やめる", "変える", "やめる"]);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    // 取り消したので住んでいる街は札幌のまま
    await expect(page.getByLabel("住んでいる街を選ぶ")).toBeVisible();
    await expect(page.locator("dialog")).toHaveCount(0);
  });

  test("SPEC §9.14-3: 「地図」「さがす」は街のページではその街、それ以外では居住街を指す", async ({ page }) => {
    await page.goto("/otaru");
    await page.getByRole("link", { name: "さがす" }).click();
    await expect(page).toHaveURL(/\/otaru\/search(?:\?.*)?$/);

    await page.getByRole("link", { name: "栞" }).click();
    await expect(page).toHaveURL(/\/bookmarks$/);

    // /bookmarks は街のページではないため、居住街（デモ利用者Aさんは札幌）へ戻る。
    await page.getByRole("link", { name: "地図", exact: true }).click();
    await expect(page).toHaveURL(/\/sapporo(?:\?.*)?$/);
  });

  test("同じ確認依頼への再回答ではポイントを加算しない", async ({ browser }) => {
    const context = await browser.newContext();
    const firstPage = await context.newPage();
    const stalePage = await context.newPage();
    const requestPath = `/verify/${DEMO_VERIFICATION_REQUEST_ID}`;

    await Promise.all([firstPage.goto(requestPath), stalePage.goto(requestPath)]);
    await firstPage.getByRole("button", { name: "静かなまま" }).click();
    await expect(firstPage.getByText("+5", { exact: true })).toBeVisible();
    // SPEC motion §5.7: 受け付けられたら「ありがとう！」、選んだ答えの判子が店のカードの置き場に押され、花丸が描かれる
    await expect(firstPage.getByText("ありがとう！", { exact: true })).toBeVisible();
    await expect(firstPage.locator(".verify-slot .stamp")).toHaveText("静");
    await expect(firstPage.locator(".verify-hanamaru")).toBeVisible();

    await stalePage.getByRole("button", { name: "静かなまま" }).click();
    await expect(stalePage.getByText("この確認は回答済みです。", { exact: true })).toBeVisible();
    await expect(stalePage.getByText("+0", { exact: true })).toHaveCount(0);
    await context.close();
  });
});
