// メールリンクの戻り先 origin（Spec §9.13.7・§9.13.8）。
// リクエストヘッダー（host / x-forwarded-host / x-forwarded-proto）は使わず、固定の環境変数だけから作る。
// Supabase 側でも Authentication → URL Configuration の Redirect URLs にこの origin の /auth/callback を登録すること。
//
// - 本番（VERCEL_ENV=production または NODE_ENV=production）は https だけ。
// - 本番以外は https か、http の localhost / 127.0.0.1 / ::1 だけ。

import { EnvironmentConfigError, isProductionRuntime } from "../supabase/env";

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** NEXT_PUBLIC_SITE_URL の origin。未設定・不正なら例外（デモモードではこの関数を呼ばない）。 */
export function getSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
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
