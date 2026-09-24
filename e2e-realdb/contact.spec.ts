import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

// /contact お問い合わせ（SPEC §9.17）を実DB（ローカル Supabase）で通す。
// デモモードは常にデモユーザーでログイン中のため、「未ログインで個人情報の請求を送る」（返信先が必須）はここで確かめる。
// 送信は Server Action → service_role の RPC（0010・0013）。保存された行を service_role で読んで確かめる。
// 前提: `npx supabase db reset` 直後の seed。実行後は `npx supabase db reset` で元に戻す。

const SUPABASE_URL = requiredEnv("REALDB_SUPABASE_URL");
const SERVICE_ROLE_KEY = requiredEnv("REALDB_SERVICE_ROLE_KEY");

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} が未設定です。npm run test:e2e:realdb で実行してください。`);
  return value;
}

const PRIVACY_LABEL = "自分の個人情報について（開示・訂正・削除・利用停止）";

test("未ログインで個人情報の請求を選ぶと2つの経路を案内し、返信先が無ければ保存しない", async ({ page }) => {
  await page.goto("/contact");
  await page.getByText(PRIVACY_LABEL, { exact: true }).click();
  await expect(page.getByRole("radio", { name: PRIVACY_LABEL })).toBeChecked();

  await expect(page.getByText(/ログインできない場合や退会した場合は/)).toBeVisible();
  await expect(page.getByRole("link", { name: "ログインする" })).toHaveAttribute("href", "/login?next=%2Fcontact");
  const replyTo = page.getByLabel("返信用のメールアドレス（必須）");
  await expect(replyTo).toHaveAttribute("aria-required", "true");

  // 返信先を書かずに送ると、サーバー（Server Action と DB 関数）が拒否し、返信先の欄へフォーカスが移る。
  const message = `未ログインの個人情報の請求（返信先なし） E2E-${Date.now()}`;
  await page.getByLabel("お問い合わせの内容（2000字まで）").fill(message);
  await page.getByRole("button", { name: "送る" }).click();
  await expect(
    page.getByText("ログインせずに送る場合は、本人確認のため、返信用のメールアドレスを入力してください。"),
  ).toHaveRole("alert");
  await expect(replyTo).toBeFocused();
  await expect(page.getByText("お送りしました。ありがとうございます。")).toHaveCount(0);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data } = await admin.from("contact_messages").select("id").eq("message", message);
  expect(data ?? []).toHaveLength(0);
});

test("ログインできない人・退会した人は、返信先を書けば個人情報の請求を送れる（R20 重要3）", async ({ page }) => {
  const message = `未ログインの個人情報の請求（返信先あり） E2E-${Date.now()}`;
  await page.goto("/contact");
  await page.getByText(PRIVACY_LABEL, { exact: true }).click();
  await page.getByLabel("お問い合わせの内容（2000字まで）").fill(message);
  await page.getByLabel("返信用のメールアドレス（必須）").fill("former-user@example.com");
  await page.getByRole("button", { name: "送る" }).click();
  await expect(page.getByRole("heading", { name: "お送りしました。ありがとうございます。" })).toBeFocused();
  await expect(page.getByText("本人確認のうえ回答します。", { exact: true })).toBeVisible();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from("contact_messages")
    .select("category, requester_id, reply_to")
    .eq("message", message);
  expect(error).toBeNull();
  expect(data).toEqual([{ category: "privacy", requester_id: null, reply_to: "former-user@example.com" }]);
});

test("未ログインで送ると service_role 経由で保存され、ブラウザの User-Agent が残る", async ({ page }) => {
  const message = `実DBの問い合わせ E2E-${Date.now()}`;
  await page.goto("/contact");
  await page.getByText("その他", { exact: true }).click();
  await page.getByLabel("お問い合わせの内容（2000字まで）").fill(message);
  await page.getByRole("button", { name: "送る" }).click();
  await expect(page.getByRole("heading", { name: "お送りしました。ありがとうございます。" })).toBeFocused();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from("contact_messages")
    .select("category, requester_id, user_agent")
    .eq("message", message);
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  const row = data?.[0];
  expect(row?.category).toBe("other");
  expect(row?.requester_id).toBeNull();
  const browserUserAgent = await page.evaluate(() => navigator.userAgent);
  expect(row?.user_agent).toBe(browserUserAgent.slice(0, 200));
});
