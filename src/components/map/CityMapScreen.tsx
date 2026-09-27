"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { City, Spot } from "@/lib/db/types";
import { daysSince } from "@/lib/domain/lifecycle";
import { AnimatedCounter, Card } from "@/components/ui";
import { AddBookmarkButton } from "@/components/bookmark/AddBookmarkButton";
import { FilterChips, SpotListItem } from "@/components/spot-list";
import { sortSpots, splitByQuietness } from "@/lib/domain/ordering";
import { MapCanvas } from "./index";
import type { MapPin, MapPoint } from "./index";
import { buildDistanceMap, parseUrlOrigin, useResolvedOrigin, walkingLabel, WITHIN_10MIN_METERS } from "./geo";

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

  const fallbackCenter = useMemo(() => ({ lat: city.centerLat, lng: city.centerLng }), [city.centerLat, city.centerLng]);
  // Codex R9 重要1: URLにlat/lngが明示されていればそれを基準点にする（共有リンクの座標を尊重）。
  // 無ければ useOrigin（Geolocation。解決待ちの間は resolved:false で街の中心を返す）。
  const urlOrigin = useMemo(() => parseUrlOrigin(searchParams), [searchParams]);
  const { origin, resolved } = useResolvedOrigin(fallbackCenter, urlOrigin);

  // 現在地は URL に書き込まない。書き込み（router.replace や履歴 API）は、読み込み直後に押した
  // 「さがす」などの遷移を後から上書きしてしまうため。地図の並びは下で現在地の距離を使って付け直す。

  const visibleSpots = useMemo(() => {
    if (!focusedSpotIds) return spots;
    const idSet = new Set(focusedSpotIds);
    return spots.filter((s) => idSet.has(s.id));
  }, [spots, focusedSpotIds]);

  const distances = useMemo(() => buildDistanceMap(visibleSpots, origin), [visibleSpots, origin]);
  // SPEC §9.14-8（2026-09-19 改訂）: 見出しは街の名前だけ。件数（quietCount）も街全体で数える。
  const cityHeading = city.name;

  // SPEC §9.14-5: 「まだ静か」ON時は quiet を上、crowding/touristy を「混みはじめた店」の下にまとめる。
  const quietNowActive = activeFilters.includes("quiet-now");
  // Codex R9 重要1: 「徒歩10分」はクライアントの基準点（URL座標優先、無ければ現在地/街の中心）
  // からの距離で絞り込む（サーバー側では絞り込まない）。
  const withinTenMinActive = activeFilters.includes("within-10min");
  // Codex R9 重要2: URL座標が無く、位置解決待ち（resolved===false）の間はピンを出さず絞り込みを保留する。
  const originPending = withinTenMinActive && !urlOrigin && !resolved;
  const filteredSpots = useMemo(() => {
    if (originPending) return [];
    if (!withinTenMinActive) return visibleSpots;
    return visibleSpots.filter((s) => (distances[s.id] ?? Infinity) <= WITHIN_10MIN_METERS);
  }, [visibleSpots, distances, withinTenMinActive, originPending]);
  // Spec §9.5 の順（距離は現在地から）をクライアント側でも付け直す（上の URL 更新はサーバーへ取り直さないため）。
  const sortedSpots = useMemo(() => sortSpots(filteredSpots, distances), [filteredSpots, distances]);
  const { quiet: quietSpots, crowded: crowdedSpots } = useMemo(() => splitByQuietness(sortedSpots), [sortedSpots]);
  const topSpots = quietNowActive ? quietSpots : sortedSpots;
  const bottomSpots = quietNowActive ? crowdedSpots : [];

  // SPEC §9.14-16: 条件（絞り込みチップ・栞からの絞り込み）付きの0件と、
  // 街に本当に店が無い0件とで空状態の文言を分ける。
  // 「まだ静か」は除外しない（§9.14-5）ので、ON/OFF どちらでも条件とはみなさない。
  const hasExcludingFilter = activeFilters.some((slug) => slug !== "quiet-now");
  const hasConditions = hasExcludingFilter || focusedSpotIds !== null;

  const selectedSpot = filteredSpots.find((s) => s.id === selectedId) ?? null;
  const hoveredSpot = hover ? (filteredSpots.find((s) => s.id === hover.id) ?? null) : null;

  const pins: MapPin[] = useMemo(
    () => filteredSpots.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, quietness: s.quietness, label: s.name })),
    [filteredSpots],
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

  // SPEC §9.14-16: 絞り込みチップを既定に戻し、栞からの絞り込み（`?spots=`）も外す。
  const clearConditions = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("filters");
    params.delete("spots");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return (
    <div className="relative h-[calc(100dvh-4rem)] lg:h-screen lg:flex">
      {/* D1: 左サイドバー（街見出し／リード文／絞り込みチップ／店リスト）。
          ブランド「そっとマップ」表記はグローバル SideRail 側にのみ出す
          （SPEC §9.12-1: ページ内サイドバーからは外す）。 */}
      <aside
        className="hidden lg:flex lg:w-[360px] lg:shrink-0 lg:flex-col lg:gap-4 lg:overflow-y-auto lg:p-4"
        style={{ background: "var(--color-bg)", borderRight: "1px solid var(--color-divider)" }}
      >
        <div>
          {/* SPEC §9.14-11: ページの意味上のh1（見た目は原本のh2相当30px）。
              モバイル側見出し（下記）とはCSSの hidden/lg:hidden で排他表示のため、
              アクセシビリティツリー上のh1は常に1つ。 */}
          <h1 className="mb-1" style={{ fontSize: 30 }}>
            {cityHeading}
          </h1>
          <p className="text-muted text-sm">
            地元が確認したまま静かな店、<AnimatedCounter value={quietCount} />軒。
          </p>
          <Link href={`/${city.slug}/spots/new#pending-spots`} className="text-xs" style={{ color: "var(--color-accent-700)" }}>
            承認待ちのピンを見る
          </Link>
        </div>
        <FilterChips active={activeFilters} onToggle={toggleFilter} />
        {sortedSpots.length === 0 ? (
          <div className="space-y-2">
            {/* Codex R9 重要2: 位置解決待ちの間はピンを出さず、その旨を控えめに表示する。 */}
            <p className="text-muted text-sm m-0">
              {originPending
                ? "現在地を確認しています…"
                : hasConditions
                  ? "条件に合う店が見つかりませんでした。"
                  : "まだ店がありません。"}
            </p>
            {!originPending ? (
              <div className="flex flex-wrap gap-2">
                {hasConditions ? (
                  <button type="button" className="btn btn-secondary" onClick={clearConditions}>
                    絞り込みを解除する
                  </button>
                ) : null}
                <Link href={`/${city.slug}/spots/new`} className="btn btn-secondary">
                  ピンを立てる
                </Link>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-1 list-none m-0 p-0">
              {topSpots.map((spot) => (
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
            {bottomSpots.length > 0 ? (
              <div className="space-y-1">
                <h4 className="text-muted m-0" style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
                  混みはじめた店
                </h4>
                <ul className="flex flex-col gap-1 list-none m-0 p-0">
                  {bottomSpots.map((spot) => (
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
              </div>
            ) : null}
          </>
        )}
      </aside>

      {/* 地図（モバイルは全面、PCは右ペイン） */}
      <div className="relative flex-1 min-w-0 h-full">
        {/* S2: モバイル上部ヘッダ（街名／「静かなまま、N軒」／栞導線） */}
        <div className="lg:hidden absolute top-0 inset-x-0 z-10 flex items-start justify-between gap-2 p-3 pointer-events-none">
          {/* 全幅の透明な枠がズームボタンへのタップを奪わないよう、枠は素通しにして中身だけ操作を受ける */}
          <div
            className="flex-1 pointer-events-auto"
            style={{ background: "var(--color-bg)", borderRadius: "var(--radius-md)", padding: "8px 14px", boxShadow: "var(--shadow-md)" }}
          >
            {/* SPEC §9.14-11: モバイル側の意味上のh1（デスクトップ側のh1とはCSSで排他表示）。 */}
            <h1 className="m-0" style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 15, letterSpacing: "0.06em" }}>
              {cityHeading}
            </h1>
            <div className="text-xs text-muted">
              静かなまま、<AnimatedCounter value={quietCount} />軒
            </div>
            <Link href={`/${city.slug}/spots/new#pending-spots`} className="text-xs" style={{ color: "var(--color-accent-700)" }}>
              承認待ちのピンを見る
            </Link>
            {/* SPEC §9.14-15/16: モバイルでも0件のとき投稿への導線を出す。
                条件（絞り込みチップ・栞からの絞り込み）付きの0件は文言を分け、解除導線も出す。 */}
            {sortedSpots.length === 0 ? (
              <p className="text-xs text-muted m-0">
                {originPending ? (
                  "現在地を確認しています…"
                ) : (
                  <>
                    {hasConditions ? "条件に合う店が見つかりませんでした。" : "まだ店がありません。"}
                    {hasConditions ? (
                      <button
                        type="button"
                        onClick={clearConditions}
                        className="ml-1"
                        style={{ color: "var(--color-accent-700)", background: "none", border: "none", padding: 0, textDecoration: "underline" }}
                      >
                        絞り込みを解除する
                      </button>
                    ) : null}
                    <Link href={`/${city.slug}/spots/new`} className="ml-1" style={{ color: "var(--color-accent-700)" }}>
                      ピンを立てる
                    </Link>
                  </>
                )}
              </p>
            ) : null}
          </div>
          <Link
            href="/bookmarks"
            aria-label="栞"
            className="btn btn-secondary btn-icon pointer-events-auto"
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
          // 右上のズームボタンは「栞」の丸ボタンと重なるため、.city-map で栞ボタンの下へずらす
          // （下部は選択カード・「＋」・出典が占めるので置かない）。
          className="absolute inset-0 city-map"
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
              {hoveredSpot.hoverDescription ?? hoveredSpot.reason}
            </Card>
          </div>
        ) : null}

        {/* ピン選択時の下部カード（S2）: 徒歩N分・地元N人が確認／店名／一行説明／この店を読む＋栞に挟む */}
        {selectedSpot ? (
          <div className="absolute z-10 bottom-4 left-4 right-4 lg:hidden">
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
                <AddBookmarkButton
                  key={selectedSpot.id}
                  spotId={selectedSpot.id}
                  initiallyBookmarked={bookmarkedSpotIds?.includes(selectedSpot.id) ?? false}
                  variant="ghost"
                />
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
