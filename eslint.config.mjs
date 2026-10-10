import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // E2E 用に distDir を分けた dev サーバーの生成物（playwright.config.ts / playwright.realdb.config.ts）
    ".next-e2e/**",
    ".next-e2e-reduce/**",
    ".next-demo/**",
    ".next-realdb/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // predev/prebuild で node_modules からコピーする MapLibre の Worker（生成物）
    "public/maplibre/**",
    // 設計・見本の作業フォルダ（.gitignore 済み。動く見本の撮影スクリプトなどアプリ外の物）
    ".superpowers/**",
  ]),
]);

export default eslintConfig;
