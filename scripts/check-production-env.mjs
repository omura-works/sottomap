#!/usr/bin/env node
// 本番公開前に、必要な環境変数が揃っているか・形式が正しいかを確認するスクリプト。
// 依存追加なし（Node標準機能のみ）。秘密の値は表示しない（設定済み/未設定と、形式の妥当性だけを出す）。
//
// 使い方:
//   node scripts/check-production-env.mjs
//
// Vercel の Production 環境の値をローカルに `.env.production.local` などへ書き出して
// 検査する場合は、`--env-file` で読み込むか、シェルで export してから実行してください。
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
    messages.push("NG: 未設定です。/api/cron/verification がSupabaseへ接続できません。");
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
check("CRON_SECRET", (messages) => {
  const value = readEnv("CRON_SECRET");
  if (!value || value.trim() === "") {
    messages.push("NG: 未設定または空です。Vercel Cron からの呼び出しがすべて401になります。");
    return;
  }
  if (value.length < 32) {
    messages.push(
      `注意: 長さが${value.length}文字です。推測されにくい十分に長いランダムな値（32文字以上を推奨）にしてください。`,
    );
  } else {
    messages.push(`OK: 設定済みです（長さ${value.length}文字。値は表示しません）。`);
  }
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
