import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

// 実DB版 E2E（`npm run test:e2e:realdb`）。ローカル Supabase（`npx supabase start` 済み・`npx supabase db reset` 直後の seed）に
// 接続した開発サーバーへ、メールのリンク（Mailpit）でログインして主要導線を通す。ローカル専用。
// 通常の `npx playwright test`（playwright.config.ts、デモモード）には含めない（testDir が別）。

const PORT = Number(process.env.REALDB_PORT ?? 3200);
// Supabase のセッション Cookie と NEXT_PUBLIC_SITE_URL の origin を揃えるため localhost を使う。
const BASE_URL = `http://localhost:${PORT}`;

/** `npx supabase status -o env` の出力から必要な値を取り出す（環境変数で渡されていればそれを使う）。 */
function loadLocalSupabaseEnv(): void {
  if (process.env.REALDB_SUPABASE_URL && process.env.REALDB_ANON_KEY && process.env.REALDB_SERVICE_ROLE_KEY) return;
  const output = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match) values.set(match[1], match[2]);
  }
  const pick = (key: string): string => {
    const value = values.get(key);
    if (!value) throw new Error(`npx supabase status -o env に ${key} がありません。ローカル Supabase を起動してください。`);
    return value;
  };
  process.env.REALDB_SUPABASE_URL = pick("API_URL");
  process.env.REALDB_ANON_KEY = pick("ANON_KEY");
  process.env.REALDB_SERVICE_ROLE_KEY = pick("SERVICE_ROLE_KEY");
  process.env.REALDB_MAILPIT_URL = values.get("MAILPIT_URL") ?? values.get("INBUCKET_URL") ?? "http://127.0.0.1:54324";
}

loadLocalSupabaseEnv();
process.env.REALDB_BASE_URL = BASE_URL;

export default defineConfig({
  testDir: "./e2e-realdb",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 90_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium-realdb", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    // URASUPO_DEMO_MODE は渡さない（実DB接続）。SUPABASE_SERVICE_ROLE_KEY は cron 用だがアプリの起動条件に合わせて渡す。
    env: {
      URASUPO_DEMO_MODE: "",
      NEXT_PUBLIC_SUPABASE_URL: process.env.REALDB_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.REALDB_ANON_KEY ?? "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.REALDB_SERVICE_ROLE_KEY ?? "",
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      CRON_SECRET: "local-realdb-e2e-cron-secret-not-used",
    },
    url: `${BASE_URL}/styleguide`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
