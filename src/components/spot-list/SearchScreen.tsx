"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { City, Spot } from "@/lib/db/types";
import { Input } from "@/components/ui";
import { buildDistanceMap, useOrigin } from "@/components/map/geo";
import { splitByQuietness } from "@/lib/domain/ordering";
import { FilterChips } from "./FilterChips";
import { parseFiltersParam } from "./filters";
import { SpotListItem } from "./SpotListItem";
import { SortNote } from "./SortNote";

export interface SearchScreenProps {
  city: City;
  /** listSpots が絞り込み・並び順・件数上限（近い順に3軒）まで適用済みで返す。 */
  spots: Spot[];
  activeFilters: string[];
  query: string;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * S3「検索」`/[city]/search`。
 * 検索語・絞り込みチップは URL クエリ（q / filters / lat / lng）で管理し、
 * サーバー側の `listSpots` を通して結果を取得し直す（並び順は必ず sortSpots 経由）。
 */
export function SearchScreen({ city, spots, activeFilters, query }: SearchScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [inputValue, setInputValue] = useState(query);
  // SPEC §9.14-14: ブラウザの戻る操作などでURLの`query`が入力欄と無関係に変わったときは、
  // 入力欄をその値に同期する。effect ではなく、レンダー中に前回の`query`と比較して
  // 同期する（React公式の「propsが変わったときにstateを調整する」パターン）。
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setInputValue(query);
  }
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // SPEC §9.14-14: デバウンスのタイマーが発火した時点の最新の URL を必ず読むための ref。
  // `updateParams` の依存に `searchParams` を含めると、直前の入力で作られたタイマーの
  // クロージャが古い `searchParams`（チップ操作前の状態）を閉じ込め、後から発火したときに
  // チップの条件を消してしまう。
  // さらに、router.replace が完了して useSearchParams が更新されるまでの間も、
  // 直前に作った URL を正とするため、updateParams が遷移を始める前に ref を先に進める。
  const searchParamsRef = useRef(searchParams.toString());
  useEffect(() => {
    searchParamsRef.current = searchParams.toString();
  }, [searchParams]);

  const fallbackCenter = useMemo(() => ({ lat: city.centerLat, lng: city.centerLng }), [city.centerLat, city.centerLng]);
  const { origin, resolved } = useOrigin(fallbackCenter);
  const distances = useMemo(() => buildDistanceMap(spots, origin), [spots, origin]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParamsRef.current);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      searchParamsRef.current = params.toString();
      // SPEC §9.14-7: 検索の遷移中は aria-busy と待機表示を出す。
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router],
  );

  // 現在地解決 → lat/lng をURLへ（街の中心からの距離で代替する場合も含む）。
  useEffect(() => {
    if (!resolved) return;
    const nextLat = origin.lat.toFixed(4);
    const nextLng = origin.lng.toFixed(4);
    if (searchParams.get("lat") === nextLat && searchParams.get("lng") === nextLng) return;
    updateParams({ lat: nextLat, lng: nextLng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, origin.lat, origin.lng]);

  // 検索語はデバウンスしてURLへ反映。
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (inputValue !== query) {
        updateParams({ q: inputValue || null });
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  const toggleFilter = useCallback(
    (slug: string) => {
      // 遷移中に続けて押された場合も取りこぼさないよう、props ではなく直前に作った URL から現在の条件を読む。
      const current = parseFiltersParam(new URLSearchParams(searchParamsRef.current).get("filters"));
      const next = current.includes(slug) ? current.filter((f) => f !== slug) : [...current, slug];
      updateParams({ filters: next.length > 0 ? next.join(",") : "none" });
    },
    [updateParams],
  );

  const clearConditions = useCallback(() => {
    setInputValue("");
    updateParams({ q: null, filters: "none" });
  }, [updateParams]);

  // SPEC §9.14-5: 「まだ静か」ON時は quiet を上、crowding/touristy を「混みはじめた店」の下にまとめる。
  // OFF時は §9.5 の順のまま区切りなしで表示する。
  const quietNowActive = activeFilters.includes("quiet-now");
  const { quiet, crowded } = useMemo(() => splitByQuietness(spots), [spots]);
  const topList = quietNowActive ? quiet : spots;
  const bottomList = quietNowActive ? crowded : [];

  return (
    <div className="mx-auto max-w-xl lg:max-w-2xl px-4 py-4 lg:py-8 space-y-4">
      {/* SPEC §9.14-9: 検索画面の見出しはDOMの先頭にh1を置き、下位見出しはh2に整理する（見た目は現状維持）。 */}
      <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.5 }}>近い順に{spots.length}軒</h1>

      <Input
        type="search"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={`${city.name}の店をさがす`}
        aria-label={`${city.name}の店をさがす`}
      />

      <div className="space-y-2">
        <h2 className="text-muted" style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.875rem", lineHeight: 1.5 }}>
          絞る
        </h2>
        <FilterChips active={activeFilters} onToggle={toggleFilter} />
      </div>

      <div className="space-y-2" aria-busy={isPending}>
        {isPending ? <p className="text-muted text-sm m-0">読み込み中…</p> : null}
        <ul className="flex flex-col gap-1 list-none m-0 p-0">
          {topList.map((spot) => (
            <SpotListItem key={spot.id} spot={spot} distanceMeters={distances[spot.id]} />
          ))}
        </ul>

        {bottomList.length > 0 ? (
          <div className="space-y-2 mt-2">
            <h2 className="text-muted m-0" style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "0.875rem", lineHeight: 1.5 }}>
              混みはじめた店
            </h2>
            <ul className="flex flex-col gap-1 list-none m-0 p-0">
              {bottomList.map((spot) => (
                <SpotListItem key={spot.id} spot={spot} distanceMeters={distances[spot.id]} />
              ))}
            </ul>
          </div>
        ) : null}

        {spots.length === 0 ? (
          <div className="space-y-2">
            <p className="text-muted text-sm m-0">条件に合う店が見つかりませんでした。</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary" onClick={clearConditions}>
                絞り込みを解除する
              </button>
              <Link href={`/${city.slug}/spots/new`} className="btn btn-secondary">
                ピンを立てる
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <SortNote />
    </div>
  );
}
