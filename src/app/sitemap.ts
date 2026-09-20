import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/auth/site-url";
import { listCities } from "@/lib/db/spots";

function siteOrigin(): string {
  try {
    return getSiteOrigin();
  } catch {
    return "http://localhost:3000";
  }
}

/**
 * `/sitemap.xml`（本番公開前指示書 §4）。
 * 街の一覧から /start と各街の地図・検索ページを生成する。DB取得に失敗しても
 * build を落とさず、/start と静的ページ（/terms・/privacy・/faq）だけを含むsitemapにする
 * （公開スポット詳細は街ごとに数が変わるため、街の一覧からの生成という指示の範囲では含めない）。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const entries: MetadataRoute.Sitemap = [
    { url: `${origin}/start`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${origin}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${origin}/faq`, changeFrequency: "monthly", priority: 0.5 },
  ];

  try {
    const cities = await listCities();
    for (const city of cities) {
      entries.push(
        { url: `${origin}/${city.slug}`, changeFrequency: "daily", priority: 0.8 },
        { url: `${origin}/${city.slug}/search`, changeFrequency: "daily", priority: 0.6 },
      );
    }
  } catch (error) {
    // DB取得に失敗しても /start だけのsitemapを返す（buildを落とさない）。ただし失敗自体は
    // ビルドログ・監視で気づけるよう1行だけログに出す（R13レビュー軽微4）。
    console.error(
      "[sitemap] 街の一覧取得に失敗したため、/start だけのsitemapを返します:",
      error instanceof Error ? error.message : String(error),
    );
  }

  return entries;
}
