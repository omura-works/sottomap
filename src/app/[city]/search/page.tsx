import { notFound } from "next/navigation";
import { getCity, listSpots } from "@/lib/db/spots";
import { SearchScreen } from "@/components/spot-list";
import { firstParam, parseFiltersParam, parseOrigin } from "@/components/spot-list";

/**
 * S3「検索」`/[city]/search`。
 * 検索語・絞り込みチップはURLクエリで管理し（`SearchScreen` 側が router.replace で更新する）、
 * サーバー側で `listSpots` を呼び直して結果を得る。
 * 現在地は URL に自動で書き込まない（重要1・2: 書き込みが、利用者が直前に始めた別画面への
 * 遷移を上書きするため）。件数上限なしで条件に合う店を返し、現在地依存の絞り込み・並び順・
 * 上位3軒への切り出しは `SearchScreen` 側（クライアントの現在地）で行う。
 * `origin` は共有リンクなど URL に lat/lng が明示されているときだけ従来どおり受け付ける。
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
  });

  return <SearchScreen city={city} spots={spots} activeFilters={filters} query={q} />;
}
