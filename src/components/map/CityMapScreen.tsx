"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { City, Spot } from "@/lib/db/types";
import { daysSince } from "@/lib/domain/lifecycle";
import { Button, Card } from "@/components/ui";
import { FilterChips, SpotListItem } from "@/components/spot-list";
import { addBookmarkAction } from "@/app/actions/bookmark-actions";
import { MapCanvas } from "./index";
import type { MapPin, MapPoint } from "./index";
import { buildDistanceMap, mostCommonAreaName, useOrigin, walkingLabel } from "./geo";

export interface CityMapScreenProps {
  city: City;
  /** status='published' の店（listSpots が sortSpots を通した順で返す）。 */
  spots: Spot[];
  quietCount: number;
  /** URL `filters` を parseFiltersParam したもの。表示・トグルの単一の情報源。 */
  activeFilters: string[];
  /** `?spots=id1,id2,...`（栞の「N軒を地図にまとめる」からの受け口）。無ければ null。 */
  focusedSpotIds: string[] | null;
  /** 閲覧者が既に栞に挟んでいるスポットID（S2 選択カードの初期表示に使う）。省略時は空。 */
  bookmarkedSpotIds?: readonly string[];
}

/**
 * `City` に街の代表エリア名（例: 札幌なら「北24条」）を持たせる案は SPEC §9.12-7 に
 * 上がっているが、これは本来 T2（データ層）の管轄であり `docs/CONTRACT.md` の
 * `City` 型にはまだ存在しない。型定義そのものは変更せず、将来 T2 側が
 * `featuredArea` を追加した場合にだけ安全に拾えるよう構造的に（プロパティの
 * 有無で）判定する。無ければ null を返し、呼び出し側は従来どおり
 * `mostCommonAreaName` の推定にフォールバックする。
 */
function getFeaturedArea(city: City): string | null {
  const value = (city as { featuredArea?: string | null }).featuredArea;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * S2「地図」/ D1「PC版トップ」を1つのコンポーネントでレスポンシブに実装する
 * （PLAN Task3: モバイル用とPC用を別コンポーネントに分けない）。
 * `lg:` 未満は全面地図＋上部ヘッダ＋下部ピン選択カード（S2）、
 * `lg:` 以上は左サイドバー＋右の大きな地図の2ペイン（D1）。
 */
export function CityMapScreen({
  city,
  spots,
  quietCount,
  activeFilters,
  focusedSpotIds,
  bookmarkedSpotIds,
}: CityMapScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; point: MapPoint } | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<ReadonlySet<string>>(
    () => new Set(bookmarkedSpotIds ?? []),
  );
  const [isBookmarkPending, startBookmarkTransition] = useTransition();

  // 栞に挟む（T5 所有の Server Action に接続。SPEC §9.12-5）。
  // 即座にボタンを確定表示へ切り替えたうえで Server Action を呼ぶ
  // （`src/app/[city]/spots/[id]/BookmarkButton.tsx` と同じ楽観更新の方針）。
  const handleBookmark = useCallback((spotId: string) => {
    setBookmarkedIds((prev) => (prev.has(spotId) ? prev : new Set(prev).add(spotId)));
    startBookmarkTransition(async () => {
      await addBookmarkAction(spotId);
    });
  }, []);

  const fallbackCenter = useMemo(() => ({ lat: city.centerLat, lng: city.centerLng }), [city.centerLat, city.centerLng]);
  const { origin, resolved } = useOrigin(fallbackCenter);

  // 現在地が解決したら URL の lat/lng を同期する。これにより次回の listSpots(origin) が
  // サーバー側で正しい距離を計算し、Spec §2.4「距離が近い順」の並びで返ってくる。
  useEffect(() => {
    if (!resolved) return;
    const nextLat = origin.lat.toFixed(4);
    const nextLng = origin.lng.toFixed(4);
    if (searchParams.get("lat") === nextLat && searchParams.get("lng") === nextLng) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("lat", nextLat);
    params.set("lng", nextLng);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, origin.lat, origin.lng]);

  const visibleSpots = useMemo(() => {
    if (!focusedSpotIds) return spots;
    const idSet = new Set(focusedSpotIds);
    return spots.filter((s) => idSet.has(s.id));
  }, [spots, focusedSpotIds]);

  const distances = useMemo(() => buildDistanceMap(visibleSpots, origin), [visibleSpots, origin]);
  // SPEC §9.12-7: City 側に代表エリア（featuredArea）があればそれを使い、
  // 無ければ従来どおり表示中スポットの最頻エリア名で代替する。
  const featuredArea = useMemo(
    () => getFeaturedArea(city) ?? mostCommonAreaName(visibleSpots),
    [city, visibleSpots],
  );
  const cityHeading = featuredArea ? `${city.name}・${featuredArea}` : city.name;

  const selectedSpot = visibleSpots.find((s) => s.id === selectedId) ?? null;
  const hoveredSpot = hover ? (visibleSpots.find((s) => s.id === hover.id) ?? null) : null;

  const pins: MapPin[] = useMemo(
    () => visibleSpots.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, quietness: s.quietness, label: s.name })),
    [visibleSpots],
  );

  const toggleFilter = useCallback(
    (slug: string) => {
      const next = activeFilters.includes(slug) ? activeFilters.filter((f) => f !== slug) : [...activeFilters, slug];
      const params = new URLSearchParams(searchParams.toString());
      params.set("filters", next.length > 0 ? next.join(",") : "none");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [activeFilters, pathname, router, searchParams],
  );

  return (
    <div className="relative h-[calc(100dvh-4rem)] lg:h-screen lg:flex">
      {/* D1: 左サイドバー（街見出し／リード文／絞り込みチップ／店リスト）。
          ブランド「ウラスポ」表記はグローバル SideRail 側にのみ出す
          （SPEC §9.12-1: ページ内サイドバーからは外す）。 */}
      <aside
        className="hidden lg:flex lg:w-[360px] lg:shrink-0 lg:flex-col lg:gap-4 lg:overflow-y-auto lg:p-4"
        style={{ background: "var(--color-bg)", borderRight: "1px solid var(--color-divider)" }}
      >
        <div>
          <h2 className="mb-1">{cityHeading}</h2>
          <p className="text-muted text-sm">地元が確認したまま静かな店、{quietCount}軒。</p>
          <Link href={`/${city.slug}/spots/new#pending-spots`} className="text-xs" style={{ color: "var(--color-accent)" }}>
            承認待ちのピンを見る
          </Link>
        </div>
        <FilterChips active={activeFilters} onToggle={toggleFilter} />
        <ul className="flex flex-col gap-1 list-none m-0 p-0">
          {visibleSpots.map((spot) => (
            <SpotListItem
              key={spot.id}
              spot={spot}
              distanceMeters={distances[spot.id]}
              selected={spot.id === selectedId}
              onSelect={setSelectedId}
              description={spot.reason}
            />
          ))}
        </ul>
      </aside>

      {/* 地図（モバイルは全面、PCは右ペイン） */}
      <div className="relative flex-1 min-w-0 h-full">
        {/* S2: モバイル上部ヘッダ（街名／「静かなまま、N軒」／栞導線） */}
        <div className="lg:hidden absolute top-0 inset-x-0 z-10 flex items-start justify-between gap-2 p-3">
          <div
            className="flex-1"
            style={{ background: "var(--color-bg)", borderRadius: "var(--radius-md)", padding: "8px 14px", boxShadow: "var(--shadow-md)" }}
          >
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 15 }}>{cityHeading}</div>
            <div className="text-xs text-muted">静かなまま、{quietCount}軒</div>
            <Link href={`/${city.slug}/spots/new#pending-spots`} className="text-xs" style={{ color: "var(--color-accent)" }}>
              承認待ちのピンを見る
            </Link>
          </div>
          <Link
            href="/bookmarks"
            aria-label="栞"
            className="btn btn-secondary btn-icon"
            style={{ background: "var(--color-bg)", boxShadow: "var(--shadow-md)" }}
          >
            栞
          </Link>
        </div>

        <MapCanvas
          center={fallbackCenter}
          zoom={city.defaultZoom}
          pins={pins}
          selectedId={selectedId}
          onSelectPin={setSelectedId}
          onHoverPin={(id, point) => setHover(id && point ? { id, point } : null)}
          onBackgroundClick={() => setSelectedId(null)}
          fitToPins={Boolean(focusedSpotIds)}
          className="absolute inset-0"
        />

        {/* 右下の丸い＋（ピンを立てる） */}
        <Link
          href={`/${city.slug}/spots/new`}
          aria-label="ピンを立てる"
          className="btn btn-primary btn-icon absolute z-10"
          style={{ right: 18, bottom: 22, width: 52, height: 52, fontSize: 26, boxShadow: "var(--shadow-lg)" }}
        >
          ＋
        </Link>

        {/* D1: 地図上ホバーカード「地元3人が確認・12日前」 */}
        {hover && hoveredSpot ? (
          <div className="hidden lg:block absolute z-20 pointer-events-none" style={{ left: hover.point.x + 18, top: hover.point.y - 12, width: 240 }}>
            <Card
              elevation="md"
              kicker={`地元${hoveredSpot.verifierCount}人が確認・${
                hoveredSpot.lastVerifiedAt ? `${daysSince(hoveredSpot.lastVerifiedAt, new Date())}日前` : "未確認"
              }`}
              title={hoveredSpot.name}
            >
              {hoveredSpot.reason}
            </Card>
          </div>
        ) : null}

        {/* ピン選択時の下部カード（S2）: 徒歩N分・地元N人が確認／店名／一行説明／この店を読む＋栞に挟む */}
        {selectedSpot ? (
          <div className="absolute z-10 bottom-4 left-4 right-4 lg:right-auto lg:w-[380px]">
            <Card
              elevation="lg"
              kicker={`${walkingLabel(distances[selectedSpot.id] ?? 0)}・地元${selectedSpot.verifierCount}人が確認`}
              title={selectedSpot.name}
            >
              <p className="m-0">{selectedSpot.reason}</p>
              <div className="flex gap-2 mt-2 items-start">
                <Link href={`/${city.slug}/spots/${selectedSpot.id}`} className="btn btn-primary">
                  この店を読む
                </Link>
                {/* 栞アクション（T5 所有の src/app/actions/bookmark-actions.ts に接続。
                    SPEC §9.12-5）。楽観更新後に Server Action を呼ぶ。 */}
                <div className="flex flex-col items-start gap-1">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => handleBookmark(selectedSpot.id)}
                    disabled={isBookmarkPending || bookmarkedIds.has(selectedSpot.id)}
                  >
                    栞に挟む
                  </Button>
                  {bookmarkedIds.has(selectedSpot.id) ? (
                    <span className="text-muted text-xs">栞に挟みました。</span>
                  ) : null}
                </div>
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
