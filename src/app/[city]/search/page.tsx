import { notFound } from "next/navigation";
import { getCity, listSpots } from "@/lib/db/spots";
import { SearchScreen } from "@/components/spot-list";
import { firstParam, parseFiltersParam, parseOrigin } from "@/components/spot-list";

/** 「近い順に」表示件数。SPEC §4 S3 の原本表示に合わせ、上位3軒までに絞る。 */
const SEARCH_RESULT_LIMIT = 3;

/**
 * S3「検索」`/[city]/search`。
 * 検索語・絞り込みチップ・現在地はいずれもURLクエリで管理し（`SearchScreen` 側が
 * router.replace で更新する）、サーバー側で `listSpots` を呼び直して結果を得る。
 */
export default async function CitySearchPage(props: PageProps<"/[city]/search">) {
  const { city: citySlug } = await props.params;
  const searchParams = await props.searchParams;

  const city = await getCity(citySlug);
  if (!city) {
    notFound();
  }

  const filters = parseFiltersParam(firstParam(searchParams.filters));
  const q = firstParam(searchParams.q) ?? "";
  const origin = parseOrigin(searchParams.lat, searchParams.lng);

  const spots = await listSpots({
    citySlug: city.slug,
    q: q || undefined,
    filters,
    origin,
    limit: SEARCH_RESULT_LIMIT,
  });

  return <SearchScreen city={city} spots={spots} activeFilters={filters} query={q} />;
}
