// メールリンクの戻り先 origin（Spec §9.13.7・§9.13.8）。
// リクエストヘッダー（host / x-forwarded-host / x-forwarded-proto）は使わず、固定の環境変数だけから作る。
// Supabase 側でも Authentication → URL Configuration の Redirect URLs にこの origin の /auth/callback を登録すること。
//
// - 本番（VERCEL_ENV=production または NODE_ENV=production）は https だけ。
// - 本番以外は https か、http の localhost / 127.0.0.1 / ::1 だけ。

import { EnvironmentConfigError, isProductionRuntime, isPublicDemo } from "../supabase/env";

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * 公開デモで NEXT_PUBLIC_SITE_URL が無いときの URL（Vercel が入れる本番のドメイン、無ければその配置の URL）。
 * 公開デモはメールを送らないので、OGP・robots・sitemap の絶対 URL にだけ使う。
 */
function publicDemoFallbackUrl(): string | undefined {
  if (!isPublicDemo()) return undefined;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  return host ? `https://${host}` : undefined;
}

/** NEXT_PUBLIC_SITE_URL の origin。未設定・不正なら例外（デモモードではこの関数を呼ばない）。 */
export function getSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || publicDemoFallbackUrl();
  if (!raw) {
    throw new EnvironmentConfigError("NEXT_PUBLIC_SITE_URL が未設定です（例: https://urasupo.example.com）。");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EnvironmentConfigError("NEXT_PUBLIC_SITE_URL が URL として読めません。");
  }
  if (url.protocol === "https:") return url.origin;

  if (isProductionRuntime()) {
    throw new EnvironmentConfigError("本番環境の NEXT_PUBLIC_SITE_URL は https の URL にしてください。");
  }
  if (url.protocol !== "http:" || !LOOPBACK_HOSTNAMES.has(url.hostname)) {
    throw new EnvironmentConfigError(
      "NEXT_PUBLIC_SITE_URL は https の URL にしてください（http は localhost / 127.0.0.1 / ::1 の開発時だけ使えます）。",
    );
  }
  return url.origin;
}
