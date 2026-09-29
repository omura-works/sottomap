import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCity, listSpots, countQuietSpots, listBookmarks } from "@/lib/db/spots";
import { CityMapScreen } from "@/components/map/CityMapScreen";
import { firstParam, parseFiltersParam, parseFocusedSpotIds, parseOrigin } from "@/components/spot-list";
import { getCurrentUserId } from "@/lib/auth";
import { PageTransition } from "@/components/motion/PageTransition";

/**
 * S2「地図」/ D1「PC版トップ」`/[city]`。
 * データ取得はサーバー側で行い（`listSpots` は必ず `sortSpots` を通した順で返す想定）、
 * インタラクティブな部分（現在地・選択ピン・絞り込みチップの反映）は
 * クライアントコンポーネント `CityMapScreen` に委譲する。
 *
 * URLクエリ:
 * - `filters`: 絞り込みチップ（カンマ区切り slug、既定は「まだ静か」のみ）
 * - `lat` / `lng`: 共有リンクなど、URLに現在地が明示されているとき用（クライアントは現在地を
 *   自動でURLへ書き込まない。Codex R9 重要1・2）
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
  // SPEC §9.14-8（2026-09-19 改訂）: 見出しは街の名前だけにし、件数も街全体の静かな店で数える
  // （エリアで数えると、地図に静かな店が見えているのに「0軒」と出ることがあったため）。
  const [quietCount, bookmarks] = await Promise.all([
    countQuietSpots(city.slug),
    userId ? listBookmarks(userId) : Promise.resolve([]),
  ]);
  const bookmarkedSpotIds = bookmarks.map((bookmark) => bookmark.spotId);

  return (
    <PageTransition>
      <CityMapScreen
        city={city}
        spots={spots}
        quietCount={quietCount}
        activeFilters={filters}
        focusedSpotIds={focusedSpotIds}
        bookmarkedSpotIds={bookmarkedSpotIds}
      />
    </PageTransition>
  );
}
