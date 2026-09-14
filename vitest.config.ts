import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Spec §9.13.1: デモモード（フィクスチャ経路）は明示したときだけ。単体テストはデモモードで動かす。
    env: { URASUPO_DEMO_MODE: "1" },
    exclude: ["e2e/**", "node_modules/**"],
  },
});
