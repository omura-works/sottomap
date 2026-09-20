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

  await expect(page.getByText("お送りしました。ありがとうございます。")).toHaveRole("status");
  // 入力欄は閉じる（同じ内容をもう一度送れない）。
  await expect(page.getByRole("button", { name: "送る" })).toHaveCount(0);
});

test("/contact は用件・本文が空のまま送れない", async ({ page }) => {
  await page.goto("/contact");

  await page.getByRole("button", { name: "送る" }).click();
  await expect(page.getByText("用件を選んでください")).toHaveRole("alert");
  await expect(page.getByText("お送りしました。ありがとうございます。")).toHaveCount(0);

  await page.getByText("その他", { exact: true }).click();
  await page.getByRole("button", { name: "送る" }).click();
  await expect(page.getByText("お問い合わせの内容を入力してください")).toHaveRole("alert");
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
