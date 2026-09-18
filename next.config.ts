import type { NextConfig } from "next";

// 地図タイルの取得元（src/components/map/MapCanvas.tsx の既定値と一致させる）。
// タイルは fetch() で読み込まれるため img-src・connect-src の両方に許可が必要。
const GSI_TILE_ORIGIN = "https://cyberjapandata.gsi.go.jp";

/** NEXT_PUBLIC_SUPABASE_URL のオリジン。未設定・不正なら null（デモモード等）。 */
function supabaseOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * CSP（Spec 本番公開前指示書 §1）。
 *
 * まずは Content-Security-Policy-Report-Only で導入する。理由:
 * Next.js のハイドレーション用インラインスクリプト（`self.__next_f=...`）や、
 * このアプリが多用する React のインライン `style` 属性は nonce を発行しないと
 * `'unsafe-inline'` なしには動かせない。nonce を配るには `src/proxy.ts`
 * （認証セッションの更新を担う既存の共有ファイル）を書き換える必要があり、
 * 他エージェントが同時に触っている領域に踏み込むリスクが高いため、今回は
 * 「まず観測する」段階として Report-Only を選ぶ（script-src/style-src は
 * 現状の実装に合わせて 'unsafe-inline' を許可し、ここでは違反を出さない）。
 * MapLibre の Worker は `/maplibre/maplibre-gl-worker.mjs`（同一オリジン）から読むが、
 * 内部で blob: URL を使う場合があるため worker-src に blob: も許可する。
 * MapLibre GL JS はスタイル式（フィルタ等）の評価に `new Function()` を使うため、
 * script-src に `'unsafe-eval'` も許可する（E2Eで実測、地図表示だけで違反が出た）。
 */
function contentSecurityPolicy(): string {
  const supabase = supabaseOrigin();
  const connectSrc = ["'self'", GSI_TILE_ORIGIN, ...(supabase ? [supabase] : [])];
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: " + GSI_TILE_ORIGIN,
    "font-src 'self' data:",
    "connect-src " + connectSrc.join(" "),
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  return directives.join("; ");
}

const nextConfig: NextConfig = {
  // Playwright / ローカル検証が 127.0.0.1 経由で dev サーバーへ接続するための許可。
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // 開発中の右下「N」インジケーターを非表示にする（仕上げA-2）。
  devIndicators: false,
  // NEXT_DIST_DIR が指定されたときだけ .next 以外を使う。実DB版 E2E
  // （playwright.realdb.config.ts）が、ポート3100で動く別の dev サーバーと
  // distDir のロックファイルを競合させないための切り替え（既定の開発・本番では未設定）。
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  async headers() {
    const isProduction = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
    const headers: Array<{ key: string; value: string }> = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // geolocation は自オリジンでのみ許可（S2 の現在地取得）。camera/microphone 等は使わないため拒否。
      { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
      // クリックジャッキング対策。CSP の frame-ancestors 'none' と重ねて指定する。
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy() },
    ];
    if (isProduction) {
      // HTTPS 環境（本番）でのみ有効。preload はドメイン管理側の登録が別途必要なため付けない。
      headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
