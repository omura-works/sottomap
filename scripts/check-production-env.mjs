#!/usr/bin/env node
// 本番公開前に、必要な環境変数が揃っているか・形式が正しいかを確認するスクリプト。
// 依存追加なし（Node標準機能のみ）。秘密の値は表示しない（設定済み/未設定と、形式の妥当性だけを出す）。
//
// 使い方: 秘密の値（SUPABASE_SERVICE_ROLE_KEY・CRON_SECRET）はVercelで Secret 種別として登録すると
// 登録後に値を読み出せなくなる（`vercel env pull` でも取得できない）ため、`vercel env pull` は
// このスクリプトの検査には使えない。代わりに、Vercel へ登録する**前**に本人が値を入れた
// `.env.production.local` に対して実行する運用にする:
//   node --env-file=.env.production.local scripts/check-production-env.mjs
//
// シェルで export 済みの環境変数だけを検査したい場合は --env-file を省略してもよい。
// このスクリプトは値を外部へ送信しない。
//
// 終了コード: 問題があれば 1、なければ 0。

/** @typedef {{ name: string, ok: boolean, messages: string[] }} CheckResult */

const results = [];

/** @param {string} name @returns {string | undefined} */
function readEnv(name) {
  return process.env[name];
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function isPlausibleUrl(value) {
  try {
    return Boolean(new URL(value));
  } catch {
    return false;
  }
}

/**
 * 32文字以上あっても、短い並び（周期4以下）を繰り返しただけの値は推測されやすい
 * （例: "abcdabcdabcdabcdabcdabcdabcdabcd"、"abababababababababababababababab"）。
 * 単一文字の繰り返し（周期1）は別のチェック（`/^(.)\1*$/`）で検出済みのため、ここでは周期2〜4を調べる。
 * @param {string} value
 */
function isShortPeriodRepeat(value) {
  for (let period = 2; period <= 4; period += 1) {
    if (value.length % period !== 0) continue;
    const unit = value.slice(0, period);
    if (unit.repeat(value.length / period) === value) return true;
  }
  return false;
}

function check(name, fn) {
  const messages = [];
  let ok = true;
  try {
    fn(messages);
  } catch (error) {
    ok = false;
    messages.push(`予期しないエラー: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (messages.some((m) => m.startsWith("NG:"))) ok = false;
  results.push({ name, ok, messages });
}

// --- NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ---
check("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY", (messages) => {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL")?.trim();
  const anonKey = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")?.trim();
  if (!url && !anonKey) {
    messages.push("NG: 両方未設定です。Supabaseプロジェクトの URL と anon key を設定してください。");
    return;
  }
  if (!url) {
    messages.push("NG: NEXT_PUBLIC_SUPABASE_URL が未設定です（anon keyだけでは起動時に例外になります）。");
  } else if (!isHttpsUrl(url)) {
    messages.push(`NG: NEXT_PUBLIC_SUPABASE_URL が https の URL ではありません（値: ${url}）。`);
  } else {
    messages.push("OK: NEXT_PUBLIC_SUPABASE_URL は設定済みで https です。");
  }
  if (!anonKey) {
    messages.push("NG: NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です（URLだけでは起動時に例外になります）。");
  } else {
    messages.push("OK: NEXT_PUBLIC_SUPABASE_ANON_KEY は設定済みです（値は表示しません）。");
  }
});

// --- SUPABASE_SERVICE_ROLE_KEY ---
check("SUPABASE_SERVICE_ROLE_KEY", (messages) => {
  const value = readEnv("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!value) {
    messages.push("NG: 未設定です。/api/cron/verification とお問い合わせ（/contact）の保存がSupabaseへ接続できません。");
  } else {
    messages.push("OK: 設定済みです（値は表示しません）。");
  }
});

// --- NEXT_PUBLIC_SITE_URL ---
check("NEXT_PUBLIC_SITE_URL", (messages) => {
  const value = readEnv("NEXT_PUBLIC_SITE_URL")?.trim();
  if (!value) {
    messages.push("NG: 未設定です。ログイン用メールのリンク生成が起動時に例外になります。");
    return;
  }
  if (!isPlausibleUrl(value)) {
    messages.push(`NG: URL として読めません（値: ${value}）。`);
    return;
  }
  if (!isHttpsUrl(value)) {
    messages.push(
      `NG: 本番では https の URL が必須です（値: ${value}）。http は開発時の localhost/127.0.0.1/[::1] のみ許可されます。`,
    );
    return;
  }
  messages.push(`OK: https の URL です（値: ${value}）。`);
});

// --- CRON_SECRET ---
// R13レビュー重要6・軽微5: 短すぎる／弱い値でも終了コード0になっていたのを、32文字未満・空白混入・
// .env.example のサンプル値・明らかに弱い値（同じ文字の繰り返し等）を失敗（NG）にする。値そのものは
// 一切表示しない（長さと判定結果だけを出す）。
check("CRON_SECRET", (messages) => {
  const value = readEnv("CRON_SECRET");
  if (!value || value.trim() === "") {
    messages.push("NG: 未設定または空です。Vercel Cron からの呼び出しがすべて401になります。");
    return;
  }
  if (/\s/.test(value)) {
    messages.push("NG: 空白文字を含んでいます。Authorization ヘッダーの比較に使う値には空白を含めないでください。");
    return;
  }
  if (value.length < 32) {
    messages.push(
      `NG: 長さが${value.length}文字です。推測されにくい十分に長いランダムな値（32文字以上必須）にしてください。`,
    );
    return;
  }
  // `.env.example` の CRON_SECRET は常に空欄（サンプル値を書いていない）だが、よくある
  // プレースホルダーの単語を32文字になるまで継ぎ足しただけの値は推測されやすいため、
  // 実際に弱い32文字以上の例を具体的に禁止値として明示する（R14暫定レビュー軽微6:
  // 旧実装は32文字未満の短い禁止語しか持たず、上の長さチェックで先に弾かれて絶対に
  // 到達しない dead code だった）。
  const knownWeakValues = new Set([
    "changemechangemechangemechangeme", // "changeme" を32文字になるまで継ぎ足した例
    "your-cron-secretyour-cron-secret", // "your-cron-secret" を継ぎ足した例
    "passwordpasswordpasswordpassword", // "password" を継ぎ足した例
  ]);
  if (knownWeakValues.has(value.toLowerCase())) {
    messages.push("NG: サンプル・既定値として使われがちな文字列です。ランダムな値に置き換えてください。");
    return;
  }
  if (/^(.)\1*$/.test(value)) {
    messages.push("NG: 同じ文字の繰り返しです。推測されにくいランダムな値にしてください。");
    return;
  }
  if (isShortPeriodRepeat(value)) {
    messages.push("NG: 短い並び（4文字以下）の繰り返しです。推測されにくいランダムな値にしてください。");
    return;
  }
  if (new Set(value).size < 4) {
    messages.push("NG: 使われている文字の種類が少なすぎます（推測されにくいランダムな値にしてください）。");
    return;
  }
  messages.push(`OK: 設定済みです（長さ${value.length}文字。値は表示しません）。`);
});

// --- CONTACT_RATE_SALT（お問い合わせの回数制限。SPEC §9.17） ---
// 未設定でも起動はするが、/contact の送信がすべて拒否されるため公開前に必須とする。値は表示しない。
check("CONTACT_RATE_SALT", (messages) => {
  const value = readEnv("CONTACT_RATE_SALT")?.trim();
  if (!value) {
    messages.push("NG: 未設定です。お問い合わせ（/contact）の送信がすべて拒否されます。");
    return;
  }
  if (value.length < 32) {
    messages.push(`NG: 長さが${value.length}文字です。推測されにくいランダムな値（32文字以上）にしてください。`);
    return;
  }
  messages.push(`OK: 設定済みです（長さ${value.length}文字。値は表示しません）。`);
});

// --- RESEND_API_KEY / CONTACT_NOTIFY_TO（お問い合わせの運営への通知。任意） ---
// 未設定は「警告」扱い（失敗にはしない）。片方だけの設定は通知が送られないため警告する。
check("RESEND_API_KEY / CONTACT_NOTIFY_TO（任意）", (messages) => {
  const apiKey = readEnv("RESEND_API_KEY")?.trim();
  const to = readEnv("CONTACT_NOTIFY_TO")?.trim();
  if (!apiKey && !to) {
    messages.push(
      "警告: どちらも未設定です。お問い合わせが届いても運営へメールで通知されません（Supabase の画面で定期的に確認してください）。",
    );
    return;
  }
  if (!apiKey || !to) {
    messages.push(
      `警告: ${apiKey ? "CONTACT_NOTIFY_TO" : "RESEND_API_KEY"} が未設定です。両方そろわないと通知は送られません。`,
    );
    return;
  }
  const invalid = to
    .split(",")
    .map((address) => address.trim())
    .filter((address) => address !== "" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address));
  if (invalid.length > 0) {
    messages.push(`警告: CONTACT_NOTIFY_TO にメールアドレスとして読めない値があります（${invalid.length}件）。`);
    return;
  }
  const from = readEnv("CONTACT_NOTIFY_FROM")?.trim();
  messages.push(
    from
      ? "OK: 通知の設定があります（値は表示しません）。"
      : "OK: 通知の設定があります。ただし CONTACT_NOTIFY_FROM が未設定のため送信元は Resend の検証用アドレスになり、Resend のアカウントのアドレス以外には届きません。",
  );
});

// --- URASUPO_DEMO_MODE（本番では設定しないこと） ---
check("URASUPO_DEMO_MODE（本番では未設定であること）", (messages) => {
  const value = readEnv("URASUPO_DEMO_MODE");
  if (value === "1") {
    messages.push(
      "NG: '1' が設定されています。本番実行環境（VERCEL_ENV=production または NODE_ENV=production）では起動時に例外になります。本番の環境変数からこの変数を削除してください。",
    );
  } else if (value !== undefined && value !== "") {
    messages.push(`注意: 値 '${value}' が設定されています。本番では未設定にしてください（"1"以外でも混乱の元になります）。`);
  } else {
    messages.push("OK: 未設定です。");
  }
});

// --- NEXT_DIST_DIR（本番では未設定であること） ---
// R13レビュー軽微5: 実DB版E2E専用の切り替え変数。本番に紛れ込むとビルド出力先がずれるため検査対象にする。
check("NEXT_DIST_DIR（本番では未設定であること）", (messages) => {
  const value = readEnv("NEXT_DIST_DIR");
  if (value !== undefined && value !== "") {
    messages.push(`NG: '${value}' が設定されています。実DB版E2E専用の変数のため、本番の環境変数からは削除してください。`);
  } else {
    messages.push("OK: 未設定です。");
  }
});

// --- 出力 ---
console.log("ウラスポ 本番環境変数チェック");
console.log("================================");
let hasFailure = false;
for (const result of results) {
  console.log("");
  console.log(`[${result.ok ? "OK" : "NG"}] ${result.name}`);
  for (const message of result.messages) {
    console.log(`  - ${message}`);
  }
  if (!result.ok) hasFailure = true;
}

console.log("");
console.log("================================");
if (hasFailure) {
  console.log("結果: 不足・不正な項目があります。上記のNGをすべて解消してから公開してください。");
  process.exit(1);
} else {
  console.log("結果: 必要な環境変数はすべて設定されています。");
  process.exit(0);
}
