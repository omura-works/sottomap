import { notFound } from "next/navigation";
import { getCity, listSpots, countQuietSpots } from "@/lib/db/spots";
import { CityMapScreen } from "@/components/map/CityMapScreen";
import { firstParam, parseFiltersParam, parseFocusedSpotIds, parseOrigin } from "@/components/spot-list";

/**
 * S2「地図」/ D1「PC版トップ」`/[city]`。
 * データ取得はサーバー側で行い（`listSpots` は必ず `sortSpots` を通した順で返す想定）、
 * インタラクティブな部分（現在地・選択ピン・絞り込みチップの反映）は
 * クライアントコンポーネント `CityMapScreen` に委譲する。
 *
 * URLクエリ:
 * - `filters`: 絞り込みチップ（カンマ区切り slug、既定は「まだ静か」のみ）
 * - `lat` / `lng`: 現在地（クライアントの Geolocation 解決後に付与される）
 * - `spots`: 栞画面の「N軒を地図にまとめる」から渡される対象スポットID（カンマ区切り）
 */
export default async function CityMapPage(props: PageProps<"/[city]">) {
  const { city: citySlug } = await props.params;
  const searchParams = await props.searchParams;

  const city = await getCity(citySlug);
  if (!city) {
    notFound();
  }

  const filters = parseFiltersParam(firstParam(searchParams.filters));
  const origin = parseOrigin(searchParams.lat, searchParams.lng);
  const focusedSpotIds = parseFocusedSpotIds(searchParams.spots);

  const [spots, quietCount] = await Promise.all([
    listSpots({ citySlug: city.slug, filters, origin }),
    countQuietSpots(city.slug),
  ]);

  return (
    <CityMapScreen city={city} spots={spots} quietCount={quietCount} activeFilters={filters} focusedSpotIds={focusedSpotIds} />
  );
}
