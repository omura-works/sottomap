import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3131);
const BASE_URL = `http://127.0.0.1:${PORT}`;
// SPEC motion §8.4: reduce の project は別の開発サーバー（別のインメモリのデモDB）で回す
// （user-flows.spec.ts などはデモDBを書き換えるため、同じサーバーで2回は回せない）。
const REDUCE_PORT = PORT + 1;
const REDUCE_BASE_URL = `http://127.0.0.1:${REDUCE_PORT}`;

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
      // user-flows.spec.ts はデモの単一インメモリDBを serial で書き換えていくため、
      // このファイルは chromium プロジェクトだけで実行する（mobile と共有DBのため）。
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testMatch: [
        "**/smoke.spec.ts",
        "**/user-flows.spec.ts",
        "**/geolocation.spec.ts",
        "**/start-motion.spec.ts",
        "**/start-parallax.spec.ts",
        "**/prodready.spec.ts",
        "**/legal-links.spec.ts",
        "**/contact.spec.ts",
        "**/map-motion.spec.ts",
        "**/start-defer.spec.ts",
        "**/bookmarks-gather.spec.ts",
        "**/motion-a11y.spec.ts",
        "**/motion-perf.spec.ts",
      ],
    },
    {
      // SPEC §9.14-12: モバイル（390×844）で主要導線を検証する。
      // chromium と同じインメモリDBを共有するため、user-flows.spec.ts が使う対象
      // （札幌ザンギ本舗・北24条の小さな喫茶店・確認依頼...008等）とは別データを使う。
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
      testMatch: ["**/smoke.spec.ts", "**/mobile.spec.ts"],
    },
    {
      // SPEC motion §8.4・§6.5: 動きを減らす設定（prefers-reduced-motion: reduce）でも全部の導線が最後まで使える。
      // chromium・mobile と同じ spec を、別の開発サーバー（REDUCE_PORT）で回す。
      name: "reduce",
      use: { ...devices["Desktop Chrome"], baseURL: REDUCE_BASE_URL, reducedMotion: "reduce" },
      testMatch: ["**/smoke.spec.ts", "**/user-flows.spec.ts", "**/contact.spec.ts"],
    },
    {
      name: "reduce-mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, baseURL: REDUCE_BASE_URL, reducedMotion: "reduce" },
      testMatch: ["**/smoke.spec.ts", "**/mobile.spec.ts"],
    },
  ],
  webServer: [
    {
      // デモモード（Spec §9.13.1）は URASUPO_DEMO_MODE=1 を明示したときだけ、かつ本番（NODE_ENV=production）
      // では起動時に例外になる。`next build` / `next start` は NODE_ENV=production で動くため、
      // E2E は開発サーバー（`next dev`、predev で地図の Worker も配置される）をデモモードで起動する。
      command: `npm run dev -- --port ${PORT}`,
      // ポート3100で動く別の dev サーバー（同じ .next ロックファイル）と競合しないよう、
      // このE2E専用のdistDirを使う（next.config.ts の NEXT_DIST_DIR）。
      env: { URASUPO_DEMO_MODE: "1", NEXT_DIST_DIR: ".next-e2e" },
      // アプリ本体のデータ取得とは独立して常に200を返す /styleguide で起動完了を判定する。
      url: `${BASE_URL}/styleguide`,
      // インメモリのデモデータを毎回初期状態から検証する。
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // reduce の project 用（別のインメモリのデモDB・別の distDir）。
      command: `npm run dev -- --port ${REDUCE_PORT}`,
      env: { URASUPO_DEMO_MODE: "1", NEXT_DIST_DIR: ".next-e2e-reduce" },
      url: `${REDUCE_BASE_URL}/styleguide`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
