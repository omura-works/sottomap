import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
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
    command: `npm run dev -- --port ${PORT}`,
    // "/" は /start へ redirect するが /start はまだ他タスク未実装で 404 になるため、
    // 常に 200 を返す /styleguide（T1所有）で起動完了を判定する。
    url: `${BASE_URL}/styleguide`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
