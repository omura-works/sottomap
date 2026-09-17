"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { City, Spot } from "@/lib/db/types";
import { Input } from "@/components/ui";
import { buildDistanceMap, parseUrlOrigin, useResolvedOrigin, WITHIN_10MIN_METERS } from "@/components/map/geo";
import { sortSpots, splitByQuietness } from "@/lib/domain/ordering";
import { FilterChips } from "./FilterChips";
import { parseFiltersParam } from "./filters";
import { SpotListItem } from "./SpotListItem";
import { SortNote } from "./SortNote";

export interface SearchScreenProps {
  city: City;
  /** listSpots が検索語・タグの絞り込みまで適用済みで返す（並び順・現在地依存の絞り込み・件数上限はクライアント側）。 */
  spots: Spot[];
  activeFilters: string[];
  query: string;
}

const SEARCH_DEBOUNCE_MS = 300;
/** 「近い順に」表示件数。SPEC §4 S3 の原本表示に合わせ、上位3軒までに絞る。 */
const SEARCH_RESULT_LIMIT = 3;

/**
 * S3「検索」`/[city]/search`。
 * 検索語・絞り込みチップは URL クエリ（q / filters）で管理し、サーバー側の `listSpots` を
 * 通して結果を取得し直す。現在地に依存する処理（「徒歩10分」の絞り込み・距離順・上位3軒）は
 * `useResolvedOrigin` の基準点（URLのlat/lngが明示されていればそれ、無ければ現在地。
 * 取れなければ街の中心）を使ってクライアント側で行う（サーバーでは絞り込まない。Codex R9 重要1）。
 * 現在地を URL に自動で書き込まない方針は維持（重要2: 直前に始めた別画面への遷移を上書きしてしまうため）。
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
  // Codex R9 重要1: URLにlat/lngが明示されていればそれを基準点にする（共有リンクの座標を尊重）。
  // 無ければ useOrigin（Geolocation。解決待ちの間は resolved:false で街の中心を返す）。
  const urlOrigin = useMemo(() => parseUrlOrigin(searchParams), [searchParams]);
  const { origin, resolved } = useResolvedOrigin(fallbackCenter, urlOrigin);
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

  // 検索語はデバウンスしてURLへ反映。
  // Codex R9 重要5: アンマウント時（下のクリーンアップ）でタイマーを確実にクリアする。
  // それでも、遷移中（新しい画面がまだ描画待ちで、この画面が未アンマウントのまま）にタイマーが
  // 発火することがあるため、発火時に現在のURLがまだこの検索ページを指しているかを
  // `window.location.pathname` で確認し、そうでなければ router.replace しない
  // （検索欄に入力した直後に別画面へ遷移しても、後から検索URLへ戻されないようにする）。
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (typeof window !== "undefined" && window.location.pathname !== pathname) return;
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

  // 重要1: 「徒歩10分」はクライアントの基準点（URL座標優先、無ければ現在地/街の中心）からの
  // 距離で絞り込む（サーバー側では絞り込まない。Codex R9 重要1）。
  const withinTenMinActive = activeFilters.includes("within-10min");
  // Codex R9 重要2: URL座標が無く、位置解決待ち（resolved===false）の間は絞り込みを保留する
  // （街中心基準の一時的な結果を見せてから現在地基準へ無通知で差し替えないため）。
  const originPending = withinTenMinActive && !urlOrigin && !resolved;
  const nearbySpots = useMemo(() => {
    if (!withinTenMinActive) return spots;
    return spots.filter((spot) => (distances[spot.id] ?? Infinity) <= WITHIN_10MIN_METERS);
  }, [spots, distances, withinTenMinActive]);
  // 並び順は必ず sortSpots を通し、見出し「近い順に{N}軒」は絞り込み・上位3軒切りの後の件数。
  const visibleSpots = useMemo(
    () => (originPending ? [] : sortSpots(nearbySpots, distances).slice(0, SEARCH_RESULT_LIMIT)),
    [nearbySpots, distances, originPending],
  );

  // SPEC §9.14-5: 「まだ静か」ON時は quiet を上、crowding/touristy を「混みはじめた店」の下にまとめる。
  // OFF時は §9.5 の順のまま区切りなしで表示する。
  const quietNowActive = activeFilters.includes("quiet-now");
  const { quiet, crowded } = useMemo(() => splitByQuietness(visibleSpots), [visibleSpots]);
  const topList = quietNowActive ? quiet : visibleSpots;
  const bottomList = quietNowActive ? crowded : [];

  // Codex R9 重要2: 結果件数（の確定・変化）をライブリージョンで知らせる。
  // 位置解決待ちの間はその旨を、確定後は件数（0件なら既存の空状態文言に合わせる）を通知する。
  const statusMessage = originPending
    ? "現在地を確認しています…"
    : visibleSpots.length > 0
      ? `${visibleSpots.length}軒見つかりました`
      : "条件に合う店が見つかりませんでした。";

  // Codex R9 重要2: 位置解決で表示が街中心基準→現在地基準へ差し替わったときなど、
  // 表示中の一覧が変わってフォーカス中の要素が消えた場合は結果見出しへフォーカスを移す。
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const previousVisibleIdsRef = useRef<string[] | null>(null);
  useEffect(() => {
    const currentIds = visibleSpots.map((spot) => spot.id);
    const previousIds = previousVisibleIdsRef.current;
    previousVisibleIdsRef.current = currentIds;
    if (previousIds === null) return; // 初回描画ではフォーカスを奪わない。
    if (previousIds.join(",") === currentIds.join(",")) return;
    if (document.activeElement === document.body) {
      headingRef.current?.focus();
    }
  }, [visibleSpots]);

  return (
    <div className="mx-auto max-w-xl lg:max-w-2xl px-4 py-4 lg:py-8 space-y-4">
      {/* SPEC §9.14-9: 検索画面の見出しはDOMの先頭にh1を置き、下位見出しはh2に整理する（見た目は現状維持）。
          Codex R9 重要2: tabIndex=-1 にして、結果差し替えでフォーカスが消えたときの移動先にする。 */}
      <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.5 }}>
        {originPending ? "現在地を確認しています…" : `近い順に${visibleSpots.length}軒`}
      </h1>

      {/* Codex R9 重要2: 結果が確定・変化したことを常設のライブリージョンで通知する。 */}
      <p role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </p>

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

        {originPending ? (
          <p className="text-muted text-sm m-0">現在地を確認しています…</p>
        ) : (
          <>
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

            {visibleSpots.length === 0 ? (
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
          </>
        )}
      </div>

      <SortNote />
    </div>
  );
}
