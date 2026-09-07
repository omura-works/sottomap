import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright / ローカル検証が 127.0.0.1 経由で dev サーバーへ接続するための許可。
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
