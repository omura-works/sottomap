import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// 実DB（ローカル Supabase）に接続したアプリへ、メールのリンクでログインして主要導線を通す（R3 懸念4・SPEC §9.14-12）。
// 前提: `npx supabase db reset` 直後の seed。実行後は seed に戻すため `npx supabase db reset` をやり直す。
//
// 利用者は seed の Rさん（小樽在住、鱗友朝市の投稿者。鱗友朝市には期限到来済みの open 依頼がある）。
// dormant 復帰（§9.14-12）用のスポットと missed 依頼は、ここで service_role で作る（デモのフィクスチャは変えない）。

const APP_URL = requiredEnv("REALDB_BASE_URL");
const SUPABASE_URL = requiredEnv("REALDB_SUPABASE_URL");
const ANON_KEY = requiredEnv("REALDB_ANON_KEY");
const SERVICE_ROLE_KEY = requiredEnv("REALDB_SERVICE_ROLE_KEY");
const MAILPIT_URL = process.env.REALDB_MAILPIT_URL ?? "http://127.0.0.1:54324";

const USER_EMAIL = "demo-r@example.invalid";
const USER_ID = "b0000000-0000-4000-8000-000000000008";
const USER_NAME = "Rさん";
const SAPPORO_ID = "a0000000-0000-4000-8000-000000000001";
const OTARU_ID = "a0000000-0000-4000-8000-000000000002";
const UROKOTOMO_SPOT_ID = "d0000000-0000-4000-8000-000000000006";
const BOOKMARK_SPOT_ID = "d0000000-0000-4000-8000-000000000004";
const BOOKMARK_SPOT_NAME = "聖徳太子 飛鳥店";

// テスト専用のデータ（固定ID。実行のたびに作り直す）
const DORMANT_SPOT_ID = "e2e00000-0000-4000-8000-000000000001";
const DORMANT_SPOT_NAME = "実DB確認用の休眠中の店";
const OLDER_MISSED_REQUEST_ID = "e2e00000-0000-4000-8000-0000000000a1";
const LATEST_MISSED_REQUEST_ID = "e2e00000-0000-4000-8000-0000000000a2";

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} が未設定です。npm run test:e2e:realdb で実行してください。`);
  return value;
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function prepareDormantSpot(): Promise<void> {
  const removed = await admin.from("spots").delete().eq("id", DORMANT_SPOT_ID);
  if (removed.error) throw removed.error;

  const spot = await admin.from("spots").insert({
    id: DORMANT_SPOT_ID,
    city_id: OTARU_ID,
    name: DORMANT_SPOT_NAME,
    area_name: "色内",
    category: "喫茶",
    location: "SRID=4326;POINT(140.9990 43.1960)",
    status: "dormant",
    quietness: "quiet",
    reason: "実DBのE2E用に作る架空の店。",
    visit_frequency: "monthly",
    author_id: USER_ID,
    published_at: daysFromNow(-400),
    next_verification_at: daysFromNow(-190),
    last_verified_at: daysFromNow(-280),
    created_at: daysFromNow(-410),
  });
  if (spot.error) throw spot.error;

  // 古い missed と最新の missed。復帰に使えるのは最新の missed だけ（§9.13.3）。
  const requests = await admin.from("verification_requests").insert([
    {
      id: OLDER_MISSED_REQUEST_ID,
      spot_id: DORMANT_SPOT_ID,
      user_id: USER_ID,
      due_at: daysFromNow(-370),
      status: "missed",
      created_at: daysFromNow(-460),
    },
    {
      id: LATEST_MISSED_REQUEST_ID,
      spot_id: DORMANT_SPOT_ID,
      user_id: USER_ID,
      due_at: daysFromNow(-190),
      status: "missed",
      created_at: daysFromNow(-280),
    },
  ]);
  if (requests.error) throw requests.error;
}

async function findOpenRequestId(spotId: string): Promise<string> {
  const { data, error } = await admin
    .from("verification_requests")
    .select("id")
    .eq("spot_id", spotId)
    .eq("user_id", USER_ID)
    .eq("status", "open")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

interface MailpitMessageSummary {
  ID: string;
  To: { Address: string }[];
}

async function clearMailbox(request: APIRequestContext): Promise<void> {
  const response = await request.delete(`${MAILPIT_URL}/api/v1/messages`);
  expect(response.ok()).toBe(true);
}

/** Mailpit に届いたログイン用メールから、Supabase Auth の確認リンクを取り出す。 */
async function waitForLoginLink(request: APIRequestContext, email: string): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const list = await request.get(`${MAILPIT_URL}/api/v1/messages`);
    const body = (await list.json()) as { messages: MailpitMessageSummary[] };
    const message = body.messages.find((m) => m.To.some((to) => to.Address === email));
    if (message) {
      const detail = await request.get(`${MAILPIT_URL}/api/v1/message/${message.ID}`);
      const { Text } = (await detail.json()) as { Text: string };
      const link = /https?:\/\/\S+\/auth\/v1\/verify\?[^\s)]+/.exec(Text)?.[0];
      if (!link) throw new Error(`ログイン用メールにリンクがありません: ${Text}`);
      return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${email} 宛てのログイン用メールが Mailpit に届きませんでした`);
}

/**
 * /login からメールを送り、届いたリンクでログインする。
 * リンク（Supabase Auth の verify）は PKCE のコード付きで redirect_to へ戻す。
 * ローカル Supabase の許可リスト（supabase/config.toml の additional_redirect_urls）が
 * 反映されていない場合は site_url へ戻されるため、そのときはコードをアプリの /auth/callback へ渡し直す
 * （コード検証用の Cookie はブラウザ側にあるので、ログインの検証としては同じ）。
 */
async function logInWithEmailLink(page: Page, request: APIRequestContext, nextPath: string): Promise<void> {
  await clearMailbox(request);
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`);
  await page.getByLabel("メールアドレス").fill(USER_EMAIL);
  await page.getByRole("button", { name: "ログイン用リンクを送る" }).click();
  await expect(page.getByText("メールを送りました。届いたリンクを開いてください。", { exact: true })).toBeVisible();

  const link = await waitForLoginLink(request, USER_EMAIL);
  const verify = await request.get(link, { maxRedirects: 0 });
  expect(verify.status()).toBe(303);
  const location = new URL(verify.headers()["location"] ?? "", link);
  const code = location.searchParams.get("code");
  expect(code, `確認リンクの戻り先にコードがありません: ${location.toString()}`).toBeTruthy();

  const appOrigin = new URL(APP_URL).origin;
  if (location.origin === appOrigin && location.pathname === "/auth/callback") {
    await page.goto(location.toString());
  } else {
    const callback = new URL("/auth/callback", appOrigin);
    callback.searchParams.set("next", nextPath);
    callback.searchParams.set("code", code ?? "");
    await page.goto(callback.toString());
  }
  await expect(page).toHaveURL(new RegExp(`${nextPath.replace(/[/]/g, "\\/")}(?:\\?.*)?$`));
}

test.describe("実DB: ログイン済みの主要導線", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    await prepareDormantSpot();
    const cleared = await admin.from("bookmarks").delete().eq("user_id", USER_ID).eq("spot_id", BOOKMARK_SPOT_ID);
    if (cleared.error) throw cleared.error;
  });

  test.afterAll(async () => {
    await admin.from("spots").delete().eq("id", DORMANT_SPOT_ID);
  });

  test("メールのリンクでログインし、居住街の保存・プロフィール・栞・確認・dormant 復帰まで通す", async ({
    page,
    request,
  }) => {
    // 1. ログイン（/start へ戻る）
    await logInWithEmailLink(page, request, "/start");
    await expect(page.getByRole("heading", { name: "どの街を歩きますか" })).toBeVisible();

    // 2. /start で居住街（札幌）を保存する
    await page.getByRole("button", { name: "札幌", exact: true }).click();
    await page.getByRole("button", { name: "歩きはじめる" }).click();
    await expect(page).toHaveURL(/\/sapporo(?:\?.*)?$/);
    await expect
      .poll(async () => {
        const { data } = await admin.from("users").select("home_city_id").eq("id", USER_ID).single();
        return (data as { home_city_id: string } | null)?.home_city_id;
      })
      .toBe(SAPPORO_ID);

    // 3. /me: 本人のプロフィール・投稿（確認切れ）・確認待ち（期限到来の open 1件 + 復帰対象の最新 missed 1件）
    await page.goto("/me");
    await expect(page.getByRole("heading", { name: USER_NAME, exact: true })).toBeVisible();
    await expect(page.getByText("札幌・色内に10年", { exact: true })).toBeVisible();
    const dormantRow = page.getByRole("listitem").filter({ hasText: DORMANT_SPOT_NAME });
    await expect(dormantRow.getByText("確認切れ", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "確認待ちが2件あります" })).toBeVisible();

    // 4. 店の詳細で栞に挟み、/bookmarks に出る
    await page.goto(`/otaru/spots/${BOOKMARK_SPOT_ID}`);
    await page.getByRole("button", { name: "栞に挟む" }).click();
    await expect(page.getByText("栞に挟みました。", { exact: true })).toBeVisible();
    await page.goto("/bookmarks");
    await expect(page.getByText(BOOKMARK_SPOT_NAME, { exact: true })).toBeVisible();
    const bookmark = await admin
      .from("bookmarks")
      .select("spot_id")
      .eq("user_id", USER_ID)
      .eq("spot_id", BOOKMARK_SPOT_ID);
    expect(bookmark.error).toBeNull();
    expect(bookmark.data).toHaveLength(1);

    // 5. 期限到来済みの open 依頼（鱗友朝市）に回答する
    const openRequestId = await findOpenRequestId(UROKOTOMO_SPOT_ID);
    await page.goto(`/verify/${openRequestId}`);
    await expect(page.getByText("鱗友朝市", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "静かなまま" }).click();
    await expect(page.getByText("+5", { exact: true })).toBeVisible();
    await expect(page.getByText("地図に戻りました。", { exact: true })).toHaveCount(0);
    const answered = await admin.from("verification_requests").select("status").eq("id", openRequestId).single();
    expect((answered.data as { status: string } | null)?.status).toBe("answered");

    // 6. dormant 復帰（§9.14-12）: 古い missed には回答できず、最新の missed への回答で地図に戻る
    await page.goto(`/verify/${OLDER_MISSED_REQUEST_ID}`);
    await expect(page.getByText(DORMANT_SPOT_NAME, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "静かなまま" })).toHaveCount(0);

    // 公開一覧（匿名）には、復帰前は出ない
    const before = await anon.from("spots").select("id").eq("id", DORMANT_SPOT_ID).eq("status", "published");
    expect(before.error).toBeNull();
    expect(before.data).toHaveLength(0);

    await page.goto(`/verify/${LATEST_MISSED_REQUEST_ID}`);
    await expect(page.getByText(DORMANT_SPOT_NAME, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "静かなまま" }).click();
    await expect(page.getByText("地図に戻りました。", { exact: true })).toBeVisible();

    const after = await anon.from("spots").select("id, status").eq("id", DORMANT_SPOT_ID).eq("status", "published");
    expect(after.error).toBeNull();
    expect(after.data).toHaveLength(1);
    const nextRequests = await admin
      .from("verification_requests")
      .select("id")
      .eq("spot_id", DORMANT_SPOT_ID)
      .eq("status", "open");
    expect(nextRequests.data).toHaveLength(1);

    // 小樽の地図（公開一覧）にもピンとして戻る
    await page.goto("/otaru");
    await expect(page.getByRole("button", { name: new RegExp(DORMANT_SPOT_NAME) })).toBeVisible();
  });
});
