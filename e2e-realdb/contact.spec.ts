import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

// /contact お問い合わせ（SPEC §9.17）を実DB（ローカル Supabase）で通す。
// デモモードは常にデモユーザーでログイン中のため、「未ログインで個人情報の請求を選ぶ」はここで確かめる。
// 送信は Server Action → service_role の RPC（0010）。保存された行を service_role で読んで確かめる。
// 前提: `npx supabase db reset` 直後の seed。実行後は `npx supabase db reset` で元に戻す。

const SUPABASE_URL = requiredEnv("REALDB_SUPABASE_URL");
const SERVICE_ROLE_KEY = requiredEnv("REALDB_SERVICE_ROLE_KEY");

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} が未設定です。npm run test:e2e:realdb で実行してください。`);
  return value;
}

const PRIVACY_LABEL = "自分の個人情報について（開示・訂正・削除・利用停止）";

test("未ログインで個人情報の請求を選ぶと、ログインへの案内が出る", async ({ page }) => {
  await page.goto("/contact");
  await page.getByText(PRIVACY_LABEL, { exact: true }).click();
  await expect(page.getByRole("radio", { name: PRIVACY_LABEL })).toBeChecked();

  await expect(page.getByText("ログインしてから送ってください。本人確認のためです。")).toHaveRole("alert");
  await expect(page.getByRole("link", { name: "ログインする" })).toHaveAttribute("href", "/login?next=%2Fcontact");

  // 案内を無視して送っても、サーバー側で拒否される（保存されない）。
  const message = `未ログインの個人情報の請求 E2E-${Date.now()}`;
  await page.getByLabel("お問い合わせの内容（2000字まで）").fill(message);
  await page.getByRole("button", { name: "送る" }).click();
  await expect(page.getByRole("radio", { name: PRIVACY_LABEL })).toBeFocused();
  await expect(page.getByText("お送りしました。ありがとうございます。")).toHaveCount(0);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data } = await admin.from("contact_messages").select("id").eq("message", message);
  expect(data ?? []).toHaveLength(0);
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
