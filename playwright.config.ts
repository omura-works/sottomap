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
    // デモモード（Spec §9.13.1）は URASUPO_DEMO_MODE=1 を明示したときだけ、かつ本番（NODE_ENV=production）
    // では起動時に例外になる。`next build` / `next start` は NODE_ENV=production で動くため、
    // E2E は開発サーバー（`next dev`、predev で地図の Worker も配置される）をデモモードで起動する。
    command: `npm run dev -- --port ${PORT}`,
    env: { URASUPO_DEMO_MODE: "1" },
    // アプリ本体のデータ取得とは独立して常に200を返す /styleguide で起動完了を判定する。
    url: `${BASE_URL}/styleguide`,
    // インメモリのデモデータを毎回初期状態から検証する。
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
