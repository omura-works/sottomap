import type { NextConfig } from "next";

// 地図タイルの取得元（src/components/map/MapCanvas.tsx の既定値と一致させる）。
// タイルは fetch() で読み込まれるため img-src・connect-src の両方に許可が必要。
const GSI_TILE_ORIGIN = "https://cyberjapandata.gsi.go.jp";

/**
 * 表示名の検査（SPEC §9.18-1、0016）は、アプリが実行環境の Unicode で判定し、DB は Unicode 17.0 から作った
 * 範囲の表で判定する。実行環境の Unicode の版が変わると両者がずれるため、本番のビルド・起動では版を確かめて止める
 * （R24 軽微）。版を上げるときは、0016 の表を作り直す migration を足してからこの値を変える。
 */
const EXPECTED_UNICODE_VERSION = "17.0";
/** 公開デモ（`URASUPO_PUBLIC_DEMO=1`）。src/lib/supabase/env.ts の isPublicDemo と同じ判定。 */
const PUBLIC_DEMO = process.env.URASUPO_PUBLIC_DEMO === "1";
if (process.env.NODE_ENV === "production" && process.versions.unicode !== EXPECTED_UNICODE_VERSION) {
  const message =
    `実行環境の Unicode の版（${process.versions.unicode}）が、表示名の検査の前提（${EXPECTED_UNICODE_VERSION}）と違います。` +
    "package.json の engines（Node 24.x）を確認してください。";
  // 公開デモは DB を使わない（表示名は DB の表と照らし合わせない）ので、ずれても止めずに知らせるだけにする
  if (PUBLIC_DEMO) console.warn(`[公開デモ] ${message}`);
  else throw new Error(message);
}

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

/** CSP 違反レポートの送り先。Reporting API（report-to）用の名前と report-uri の両方で同じパスを指す。 */
const CSP_REPORT_ENDPOINT_NAME = "csp-endpoint";
const CSP_REPORT_PATH = "/api/csp-report";

/**
 * CSP（Spec 本番公開前指示書 §1、R13レビュー重要3の追補）。
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
 *
 * `'unsafe-eval'` は開発時（`next dev`）だけ許可する。MapLibre GL JS はスタイル式（フィルタ等）の
 * 評価に `new Function()` を使うが、これは `next dev` のホットリロード用ランタイムが要求する
 * 場合を含めて確認した挙動である。本番相当（`next build && next start`、`'unsafe-eval'` を外した
 * 状態）で地図・ログイン・/start を開いてもCSP違反が出ないことは、2026年9月に手動で1回確認した
 * （自動テストではない）。`e2e/prodready.spec.ts` のCSP関連テストは Playwright の既定の
 * webServer（`npm run dev`、つまり `next dev`）に対して動くため、`'unsafe-eval'` がある状態の
 * 確認にしかならない。本番相当の確認を自動化する場合は、`next build && next start` を webServer
 * にした別のE2E設定を用意すること。
 * 本番で `'unsafe-eval'` を要求する違反が Report-Only の観測で出た場合は、ここに理由を追記して
 * 最小限で戻すこと。
 *
 * `img-src`: `photoUrl`（spots）はアプリ内に書き込み経路が無く（フィクスチャ・シードは常に null）
 * 常に null か Supabase Storage 由来の値になる想定。`avatarUrl`（users）は、0011 マイグレーション
 * （SPEC §9.18）で authenticated の INSERT/UPDATE 権限から外し、`public_profiles` からも外したため、
 * 利用者が任意のURLを書き込む経路も、他者の値を読む経路も無い。img-src は引き続き Supabase Storage と
 * 同一オリジンに絞る（`<project>.supabase.co/storage/v1/...`。connect-src と同じオリジンを img-src にも
 * 許可する）。画像のアップロードや表示の機能を追加する場合は、このコメントと許可リストの見直しが必要
 * （具体的な経路が増えたら DEPLOY.md の強制移行判断にも反映する）。
 */
function contentSecurityPolicy(isProduction: boolean): string {
  const supabase = supabaseOrigin();
  const connectSrc = ["'self'", GSI_TILE_ORIGIN, ...(supabase ? [supabase] : [])];
  const imgSrc = ["'self'", "data:", "blob:", GSI_TILE_ORIGIN, ...(supabase ? [supabase] : [])];
  const scriptSrc = ["'self'", "'unsafe-inline'", ...(isProduction ? [] : ["'unsafe-eval'"])];
  const directives = [
    "default-src 'self'",
    "script-src " + scriptSrc.join(" "),
    "style-src 'self' 'unsafe-inline'",
    "img-src " + imgSrc.join(" "),
    "font-src 'self' data:",
    "connect-src " + connectSrc.join(" "),
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
    `report-to ${CSP_REPORT_ENDPOINT_NAME}`,
  ];
  return directives.join("; ");
}

const nextConfig: NextConfig = {
  // Playwright / ローカル検証が 127.0.0.1 経由で dev サーバーへ接続するための許可。
  // スマホなど同じ Wi-Fi の端末から開発サーバーを開くときは、URASUPO_DEV_ORIGINS にその PC の LAN の IP を
  // カンマ区切りで渡す（開発サーバー専用。本番には影響しない）。
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    ...(process.env.URASUPO_DEV_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? []),
  ],
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
      { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(isProduction) },
      // report-to（Reporting API）用のエンドポイント定義。CSP の `report-to` 名と一致させる。
      { key: "Reporting-Endpoints", value: `${CSP_REPORT_ENDPOINT_NAME}="${CSP_REPORT_PATH}"` },
    ];
    if (isProduction) {
      // HTTPS 環境（本番）でのみ有効。preload はドメイン管理側の登録が別途必要なため付けない。
      headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    }
    if (PUBLIC_DEMO) {
      // 公開デモは検索エンジンに載せない（実在の店のデモが本物のサービスと混同されないように。robots・meta と重ねる）
      headers.push({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    }
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
