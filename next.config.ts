import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright / ローカル検証が 127.0.0.1 経由で dev サーバーへ接続するための許可。
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // 開発中の右下「N」インジケーターを非表示にする（仕上げA-2）。
  devIndicators: false,
  // NEXT_DIST_DIR が指定されたときだけ .next 以外を使う。実DB版 E2E
  // （playwright.realdb.config.ts）が、ポート3100で動く別の dev サーバーと
  // distDir のロックファイルを競合させないための切り替え（既定の開発・本番では未設定）。
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
