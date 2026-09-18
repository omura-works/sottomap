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
 * build を落とさず、/start だけを含むsitemapにする（公開スポット詳細は街ごとに
 * 数が変わるため、街の一覧からの生成という指示の範囲では含めない）。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const entries: MetadataRoute.Sitemap = [
    { url: `${origin}/start`, changeFrequency: "weekly", priority: 1 },
  ];

  try {
    const cities = await listCities();
    for (const city of cities) {
      entries.push(
        { url: `${origin}/${city.slug}`, changeFrequency: "daily", priority: 0.8 },
        { url: `${origin}/${city.slug}/search`, changeFrequency: "daily", priority: 0.6 },
      );
    }
  } catch {
    // DB取得に失敗しても /start だけのsitemapを返す（buildを落とさない）。
  }

  return entries;
}
