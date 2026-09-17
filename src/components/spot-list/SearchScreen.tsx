"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { City, Spot } from "@/lib/db/types";
import { Input } from "@/components/ui";
import { buildDistanceMap, useOrigin } from "@/components/map/geo";
import { splitByQuietness } from "@/lib/domain/ordering";
import { FilterChips } from "./FilterChips";
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fallbackCenter = useMemo(() => ({ lat: city.centerLat, lng: city.centerLng }), [city.centerLat, city.centerLng]);
  const { origin, resolved } = useOrigin(fallbackCenter);
  const distances = useMemo(() => buildDistanceMap(spots, origin), [spots, origin]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      // SPEC §9.14-7: 検索の遷移中は aria-busy と待機表示を出す。
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
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
      const next = activeFilters.includes(slug) ? activeFilters.filter((f) => f !== slug) : [...activeFilters, slug];
      updateParams({ filters: next.length > 0 ? next.join(",") : "none" });
    },
    [activeFilters, updateParams],
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
      <Input
        type="search"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={`${city.name}の店をさがす`}
        aria-label={`${city.name}の店をさがす`}
      />

      <div className="space-y-2">
        <h3 className="text-sm text-muted" style={{ fontFamily: "var(--font-body)", fontWeight: 700 }}>
          絞る
        </h3>
        <FilterChips active={activeFilters} onToggle={toggleFilter} />
      </div>

      <div className="space-y-2" aria-busy={isPending}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.5 }}>近い順に{spots.length}軒</h1>
        {isPending ? <p className="text-muted text-sm m-0">読み込み中…</p> : null}
        <ul className="flex flex-col gap-1 list-none m-0 p-0">
          {topList.map((spot) => (
            <SpotListItem key={spot.id} spot={spot} distanceMeters={distances[spot.id]} />
          ))}
        </ul>

        {bottomList.length > 0 ? (
          <div className="space-y-2 mt-2">
            <h4 className="text-sm text-muted m-0">混みはじめた店</h4>
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
