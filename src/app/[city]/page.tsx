import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCity, listSpots, countQuietSpots, listBookmarks } from "@/lib/db/spots";
import { CityMapScreen } from "@/components/map/CityMapScreen";
import { mostCommonAreaName } from "@/components/map/geo";
import { firstParam, parseFiltersParam, parseFocusedSpotIds, parseOrigin } from "@/components/spot-list";
import { getCurrentUserId } from "@/lib/auth";

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
  await connection();
  const { city: citySlug } = await props.params;
  const searchParams = await props.searchParams;

  const city = await getCity(citySlug);
  if (!city) {
    notFound();
  }

  const filters = parseFiltersParam(firstParam(searchParams.filters));
  const origin = parseOrigin(searchParams.lat, searchParams.lng);
  const focusedSpotIds = parseFocusedSpotIds(searchParams.spots);
  const userId = await getCurrentUserId();

  const spots = await listSpots({ citySlug: city.slug, filters, origin });
  // SPEC §9.14-8: 見出しが「{街}・{エリア}」のときは、件数もそのエリアで数える
  // （CityMapScreen の見出し計算と同じ、featuredArea優先→最頻エリア名のフォールバック）。
  const featuredArea = city.featuredArea ?? mostCommonAreaName(spots);
  const [quietCount, bookmarks] = await Promise.all([
    countQuietSpots(city.slug, featuredArea ?? undefined),
    userId ? listBookmarks(userId) : Promise.resolve([]),
  ]);
  const bookmarkedSpotIds = bookmarks.map((bookmark) => bookmark.spotId);

  return (
    <CityMapScreen
      city={city}
      spots={spots}
      quietCount={quietCount}
      featuredArea={featuredArea}
      activeFilters={filters}
      focusedSpotIds={focusedSpotIds}
      bookmarkedSpotIds={bookmarkedSpotIds}
    />
  );
}
