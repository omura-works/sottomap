import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3131);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // 先に `npm run build` した成果物をデモモードで起動する。
    // next dev の開発用子プロセスを残さず、テスト終了時に確実に停止できる。
    command: `npm run start -- --port ${PORT}`,
    // アプリ本体のデータ取得とは独立して常に200を返す /styleguide で起動完了を判定する。
    url: `${BASE_URL}/styleguide`,
    // インメモリのデモデータを毎回初期状態から検証する。
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
