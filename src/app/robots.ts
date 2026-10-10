import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/auth/site-url";
import { isPublicDemo } from "@/lib/supabase/env";

/**
 * `NEXT_PUBLIC_SITE_URL` から求めた origin。未設定・不正なときは例外を投げる関数だが、
 * robots.txt はどの環境でも200を返す必要があるため、ここでは握りつぶして開発向けの
 * 既定値にフォールバックする（本番では NEXT_PUBLIC_SITE_URL が https 必須であることを
 * 別途 src/lib/auth/site-url.ts・src/lib/supabase/env.ts が保証する）。
 */
function siteOrigin(): string {
  try {
    return getSiteOrigin();
  } catch {
    return "http://localhost:3000";
  }
}

/**
 * `/robots.txt`（本番公開前指示書 §4）。
 * 公開ページ（/start、各街の地図・検索、公開スポット詳細）は許可し、ログインが要る画面や
 * 内部APIは disallow する。/[city]/spots/new はログイン必須（居住街の一致検査あり）のため
 * 収集対象から外す。
 */
export default function robots(): MetadataRoute.Robots {
  // 公開デモ（URASUPO_PUBLIC_DEMO=1）は全部を収集の対象から外す（実在の店のデモが本物と混同されないように）
  if (isPublicDemo()) return { rules: { userAgent: "*", disallow: "/" } };
  const origin = siteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/me",
        "/me/",
        "/bookmarks",
        "/bookmarks/",
        "/verify",
        "/verify/",
        "/api/",
        "/styleguide",
        "/styleguide/",
        "/login",
        "/login/",
        "/auth/",
        "/*/spots/new",
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
