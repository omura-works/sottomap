// メールリンクの戻り先 origin（Spec §9.13.7）。
// リクエストヘッダー（host / x-forwarded-host / x-forwarded-proto）は使わず、固定の環境変数だけから作る。
// Supabase 側でも Authentication → URL Configuration の Redirect URLs にこの origin の /auth/callback を登録すること。

import { EnvironmentConfigError } from "../supabase/env";

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
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new EnvironmentConfigError("NEXT_PUBLIC_SITE_URL は http(s) の URL にしてください。");
  }
  return url.origin;
}
