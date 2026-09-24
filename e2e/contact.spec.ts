import { expect, test } from "@playwright/test";

// /contact お問い合わせ（SPEC §9.17）。デモモードでは保存せず、規則だけをフィクスチャで再現する。

test("/contact から送ると、お礼が表示される", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { name: "お問い合わせ", level: 1 })).toBeVisible();

  // ラジオ本体は視覚的に隠し（原本CSSの .radio）、ラベルの当たり判定で選ぶ。
  await page.getByText("掲載を止めてほしい", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "掲載を止めてほしい" })).toBeChecked();
  await page.getByLabel("お問い合わせの内容（2000字まで）").fill("この店の掲載を止めてください。E2E-1");
  await page.getByRole("button", { name: "送る" }).click();

  // お礼は role="status" の中の見出しで、そこへフォーカスが移る（送るボタンは消えるため）。
  const thanks = page.getByRole("heading", { name: "お送りしました。ありがとうございます。" });
  await expect(thanks).toBeFocused();
  await expect(page.getByRole("status").filter({ has: thanks })).toHaveCount(1);
  // 入力欄は閉じる（同じ内容をもう一度送れない）。
  await expect(page.getByRole("button", { name: "送る" })).toHaveCount(0);
});

test("/contact の送るボタンは高さ44px以上", async ({ page }) => {
  await page.goto("/contact");
  const box = await page.getByRole("button", { name: "送る" }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("/contact はログイン中（デモユーザー）なら個人情報の請求を送れる", async ({ page }) => {
  await page.goto("/contact");
  await page.getByText("自分の個人情報について（開示・訂正・削除・利用停止）", { exact: true }).click();
  // ログイン中は未ログイン向けの案内を出さず、返信先は任意のまま。
  await expect(page.getByText(/ログインできない場合や退会した場合は/)).toHaveCount(0);
  await expect(page.getByLabel("返信用のメールアドレス（任意）")).toBeVisible();
  await page.getByLabel("お問い合わせの内容（2000字まで）").fill("登録した情報を消してください。E2E-privacy");
  await page.getByRole("button", { name: "送る" }).click();
  await expect(page.getByRole("heading", { name: "お送りしました。ありがとうございます。" })).toBeFocused();
  // 個人情報の請求には「返信をお約束するものではありません」を出さない（R20 重要3）。
  await expect(page.getByText("本人確認のうえ回答します。", { exact: true })).toBeVisible();
  await expect(page.getByText(/返信をお約束するものではありません。掲載停止/)).toHaveCount(0);
});

test("/contact は掲載停止の対応を「内容を確認でき次第」と書き、「速やかに」とは約束しない（R20 重要5）", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByText("掲載停止のご連絡は、内容を確認でき次第、対応します。", { exact: true })).toBeVisible();
  await expect(page.getByText(/速やかに/)).toHaveCount(0);
});

test("/contact は用件・本文が空のまま送れない", async ({ page }) => {
  await page.goto("/contact");

  await page.getByRole("button", { name: "送る" }).click();
  await expect(page.getByText("用件を選んでください")).toHaveRole("alert");
  // 最初の不正な項目（用件の最初の選択肢）へフォーカスが移る。
  await expect(page.getByRole("radio", { name: "掲載を止めてほしい" })).toBeFocused();
  await expect(page.getByText("お送りしました。ありがとうございます。")).toHaveCount(0);

  await page.getByText("その他", { exact: true }).click();
  await page.getByRole("button", { name: "送る" }).click();
  await expect(page.getByText("お問い合わせの内容を入力してください")).toHaveRole("alert");
  await expect(page.getByLabel("お問い合わせの内容（2000字まで）")).toBeFocused();
  await expect(page.getByText("お送りしました。ありがとうございます。")).toHaveCount(0);
});

test("/contact は2000字を超える本文を受け付けない", async ({ page }) => {
  await page.goto("/contact");

  await page.getByText("その他", { exact: true }).click();
  await page.getByLabel("お問い合わせの内容（2000字まで）").fill("あ".repeat(2001));

  await expect(page.getByText("残り-1字")).toBeVisible();
  await page.getByRole("button", { name: "送る" }).click();
  await expect(page.getByText("お問い合わせの内容は2000字以内で入力してください")).toHaveRole("alert");
  await expect(page.getByText("お送りしました。ありがとうございます。")).toHaveCount(0);
});
