import { connection } from "next/server";
import { listCities, countPublishedSpots, listRecentlyVerified } from "@/lib/db/spots";
import { StartScreen } from "./StartScreen";
import type { StartCityData } from "./StartScreen";

const DEFAULT_CITY_SLUG = "sapporo";
const RECENTLY_VERIFIED_LIMIT = 3;

/**
 * S1「街を選ぶ」（オンボーディング）`/start`。
 * 街チップの切り替えを通信なしで即時にするため、8街ぶんの「公開ピン数」と
 * 「今週、静けさが確認された店」を先に並行取得し、クライアント側の
 * StartScreen にまとめて渡す。
 *
 * リクエスト時に描画する（connection）。ビルド時に読むと、ビルド環境（NODE_ENV=production で
 * デモモード不可・Supabase 未設定）で実行モードの判定が例外になり、また公開数が古いまま固定されるため。
 */
export default async function StartPage() {
  await connection();
  const cities = await listCities();

  const entries = await Promise.all(
    cities.map(async (city) => {
      const [publishedCount, recentlyVerified] = await Promise.all([
        countPublishedSpots(city.slug),
        listRecentlyVerified(city.slug, RECENTLY_VERIFIED_LIMIT),
      ]);

      const data: StartCityData = {
        publishedCount,
        recentlyVerified: recentlyVerified.map(({ spot, verifierCount }) => ({
          spotId: spot.id,
          spotName: spot.name,
          verifierCount,
        })),
      };

      return [city.slug, data] as const;
    }),
  );

  const dataBySlug = Object.fromEntries(entries);
  const defaultCitySlug = cities.some((city) => city.slug === DEFAULT_CITY_SLUG)
    ? DEFAULT_CITY_SLUG
    : (cities[0]?.slug ?? DEFAULT_CITY_SLUG);

  return (
    <StartScreen
      cities={cities.map((city) => ({ slug: city.slug, name: city.name }))}
      dataBySlug={dataBySlug}
      defaultCitySlug={defaultCitySlug}
    />
  );
}
