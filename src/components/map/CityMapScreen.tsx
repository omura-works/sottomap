"use client";

import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import type { City, Spot } from "@/lib/db/types";
import { AnimatedCounter } from "@/components/ui";
import { usePrefersReducedMotion } from "@/components/ui/motion-prefs";
import { AddBookmarkButton, BOOKMARK_FAILED_EVENT, BOOKMARKED_EVENT } from "@/components/bookmark/AddBookmarkButton";
import type { BookmarkEventDetail } from "@/components/bookmark/AddBookmarkButton";
import { FilterChips, SpotRowLink } from "@/components/spot-list";
import type { SpotRowLinkProps } from "@/components/spot-list/SpotListItem";
import { SinkingRows } from "@/components/spot-list/SinkingRows";
import { sortSpots, splitByQuietness } from "@/lib/domain/ordering";
import { MapCanvas } from "./index";
import type { MapPin, MapPoint } from "./index";
type DistanceMap = Readonly<Record<string, number>>;
import { buildDistanceMap, parseUrlOrigin, useResolvedOrigin, walkingLabel, WITHIN_10MIN_METERS } from "./geo";
import { PIN_GLYPH } from "./pin-halo";
import { PageLamp } from "@/components/motion/PageLamp";
import { Stamp } from "@/components/motion/Stamp";
import { tiltFromId } from "@/components/motion/tilt";
import { EASE } from "@/components/motion/tokens";
import { MapHoverCard } from "./MapHoverCard";
import type { MapHoverCardHandle } from "./MapHoverCard";
import { LanternChild } from "@/components/illustrations/LanternChild";
import { DESKTOP_QUERY, useMediaQuery } from "@/components/motion/useMediaQuery";

// ピンを選ぶたびに画面全体が描き直されるので、選択と関係の無い部品は memo で止める（P7: ピンを押したときの反応 INP を守る）。
// 一覧の行は選択が変わった2行だけが描き直される。
const StillFilterChips = memo(FilterChips);
const StillSpotRowLink = memo(SpotRowLink);
const StillHoverCard = memo(MapHoverCard);
const StillCounter = memo(AnimatedCounter);

export interface CityMapScreenProps {
  city: City;
  /** status='published' の店（listSpots が sortSpots を通した順で返す）。 */
  spots: Spot[];
  quietCount: number;
  /** URL `filters` を parseFiltersParam したもの。表示・トグルの単一の情報源。 */
  activeFilters: string[];
  /** `?spots=id1,id2,...`（栞の「N軒を地図にまとめる」からの受け口）。無ければ null。 */
  focusedSpotIds: string[] | null;
  /** 閲覧者が既に栞に挟んでいるスポットID（S2 選択カードの初期表示・ピンのリボンに使う）。省略時は空。 */
  bookmarkedSpotIds?: readonly string[];
}

function spotIdOf(event: Event): string | undefined {
  return event instanceof CustomEvent ? (event as CustomEvent<BookmarkEventDetail>).detail?.spotId : undefined;
}

/** 退場中（AnimatePresence がはがしている間）はフォーカスの候補から外す包み（SPEC motion §6.3）。 */
function PresenceInert({ className, children }: { className?: string; children: ReactNode }) {
  const isPresent = useIsPresent();
  return (
    <div className={className} inert={!isPresent}>
      {children}
    </div>
  );
}

interface MapSpotListProps {
  top: readonly Spot[];
  bottom: readonly Spot[];
  distances: DistanceMap;
  onSelect: (id: string) => void;
}

/** 選んでいる店の id。一覧の行だけが読む（選択が変わっても一覧の包み・SinkingRows は描き直さない）。 */
const SelectedSpotContext = createContext<string | null>(null);

function SelectableRow(props: Omit<SpotRowLinkProps, "selected">) {
  const selectedId = useContext(SelectedSpotContext);
  return <StillSpotRowLink {...props} selected={props.spot.id === selectedId} />;
}

/**
 * PC の左の列の一覧（同じ行・同じ「静かに下がる」）。地図の操作で描き直さないよう memo。
 * 選択は SelectedSpotContext で行にだけ届ける（P7: ピンを押したときの反応 INP を守るため。スマホでは列が隠れていても描かれる）。
 */
const MapSpotList = memo(function MapSpotList({ top, bottom, distances, onSelect }: MapSpotListProps) {
  return (
    <SinkingRows
      top={top}
      bottom={bottom}
      dividerHeading="h4"
      renderRow={(spot) => (
        <SelectableRow spot={spot} distanceMeters={distances[spot.id]} onSelect={onSelect} description={spot.reason} />
      )}
    />
  );
});

/**
 * S2「地図」/ D1「PC版トップ」を1つのコンポーネントでレスポンシブに実装する
 * （PLAN Task3: モバイル用とPC用を別コンポーネントに分けない）。
 * `lg:` 未満は全面地図＋上部の見出しの札＋下部ピン選択カード（S2）、
 * `lg:` 以上は左の列＋右の大きな地図の2ペイン（D1）。
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
  // ページの灯りは、見えている方の見出し（PC なら左の列、スマホなら地図の上の札）だけがページをまたいで渡る
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const reduced = usePrefersReducedMotion();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // ホバーカードは小さな部品に分け、位置は部品の中で直接書き換える（地図を動かすたびに画面全体を描き直さない）
  const hoverCardRef = useRef<MapHoverCardHandle | null>(null);
  const handleHoverPin = useCallback((id: string | null, point: MapPoint | null) => {
    hoverCardRef.current?.update(id, point);
  }, []);

  // 栞の状態の見た目のための写し（SPEC motion §5.2 末尾・§10.2-1）。データは変えない。
  // 「栞に挟む」の瞬間（楽観的な表示と同時）に足し、失敗して戻したら引く。
  const [bookmarked, setBookmarked] = useState<ReadonlySet<string>>(() => new Set(bookmarkedSpotIds ?? []));
  useEffect(() => {
    const onBookmarked = (event: Event) => {
      const id = spotIdOf(event);
      if (!id) return;
      setBookmarked((current) => (current.has(id) ? current : new Set(current).add(id)));
    };
    const onFailed = (event: Event) => {
      const id = spotIdOf(event);
      if (!id) return;
      setBookmarked((current) => {
        if (!current.has(id)) return current;
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    };
    window.addEventListener(BOOKMARKED_EVENT, onBookmarked);
    window.addEventListener(BOOKMARK_FAILED_EVENT, onFailed);
    return () => {
      window.removeEventListener(BOOKMARKED_EVENT, onBookmarked);
      window.removeEventListener(BOOKMARK_FAILED_EVENT, onFailed);
    };
  }, []);

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

  // ピンの並び＝一覧の並び（静かな店が先・近い順）。判子もこの順に押される。
  const pins: MapPin[] = useMemo(
    () =>
      sortedSpots.map((s) => ({
        id: s.id,
        lat: s.lat,
        lng: s.lng,
        quietness: s.quietness,
        label: s.name,
        bookmarked: bookmarked.has(s.id),
      })),
    [sortedSpots, bookmarked],
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

  const pendingHref = `/${city.slug}/spots/new#pending-spots`;
  const newSpotHref = `/${city.slug}/spots/new`;
  const instant = { duration: 0 } as const;

  return (
    <div className="city-map-screen relative lg:flex">
      {/* D1: 左の列（街の見出し／件数／絞り込みチップ／店の一覧）。
          ブランド「そっとマップ」表記はグローバル SideRail 側にのみ出す
          （SPEC §9.12-1: ページ内サイドバーからは外す）。 */}
      <aside className="map-col hidden lg:flex lg:w-[360px] lg:shrink-0 lg:flex-col lg:overflow-y-auto">
        <div>
          {/* SPEC §9.14-11: ページの意味上のh1。モバイル側見出し（下記）とはCSSの hidden/lg:hidden で
              排他表示のため、アクセシビリティツリー上のh1は常に1つ。 */}
          <h1 className="map-col-title">
            <PageLamp morph={isDesktop} />
            {cityHeading}
          </h1>
          <p className="map-col-count">
            地元の人が「まだ静か」とたしかめた店、
            <span className="map-count-num verb-pop" style={{ "--d": "300ms" } as CSSProperties}>
              <StillCounter value={quietCount} />
            </span>
            <b>軒。</b>
          </p>
          <Link href={pendingHref} transitionTypes={["page-forward"]} className="map-pending-link">
            承認待ちのピンをのぞく
            <span aria-hidden="true">{"\u00a0→"}</span>
          </Link>
        </div>
        <StillFilterChips active={activeFilters} onToggle={toggleFilter} />
        {sortedSpots.length === 0 ? (
          originPending ? (
            // Codex R9 重要2: 位置解決待ちの間はピンを出さず、その旨を控えめに表示する。
            <p className="text-muted text-sm m-0">いまいる場所をたしかめています…</p>
          ) : (
            <div className="empty-state">
              <LanternChild size={48} />
              <p className="empty-state-big">
                {hasConditions ? "その条件だと、見つかりませんでした" : "この街には、まだピンがありません"}
              </p>
              <p className="empty-state-small">
                {hasConditions ? "チップを1つはずしてみてください。" : "最初の一軒、立ててみませんか？"}
              </p>
              <div className="flex flex-wrap gap-2">
                {hasConditions ? (
                  <button type="button" className="btn btn-secondary" onClick={clearConditions}>
                    しぼりこみをはずす
                  </button>
                ) : null}
                <Link href={newSpotHref} transitionTypes={["page-forward"]} className="btn btn-secondary">
                  ピンを立てる
                </Link>
              </div>
            </div>
          )
        ) : (
          <SelectedSpotContext value={selectedId}>
            <MapSpotList top={topSpots} bottom={bottomSpots} distances={distances} onSelect={setSelectedId} />
          </SelectedSpotContext>
        )}
      </aside>

      {/* 地図（モバイルは全面、PCは右ペイン） */}
      <div className="relative flex-1 min-w-0 h-full">
        {/* S2: モバイルの見出しの札（街名／「静かなまま、N 軒」／承認待ちへ）と栞の丸ボタン */}
        <div className="map-head-row lg:hidden">
          {/* 全幅の透明な枠がズームボタンへのタップを奪わないよう、枠は素通しにして中身だけ操作を受ける */}
          <div className="map-head verb-stick keep-visible">
            <span className="tape tape-in map-head-tape" style={{ "--d": "420ms" } as CSSProperties} aria-hidden="true" />
            {/* SPEC §9.14-11: モバイル側の意味上のh1（デスクトップ側のh1とはCSSで排他表示）。 */}
            <h1 className="map-head-title">
              <PageLamp morph={!isDesktop} />
              {cityHeading}
            </h1>
            <p className="map-head-count">
              静かなまま、
              <span className="map-count-num verb-pop" style={{ "--d": "300ms" } as CSSProperties}>
                <StillCounter value={quietCount} />
              </span>
              <b>軒</b>
            </p>
            <Link href={pendingHref} transitionTypes={["page-forward"]} className="map-pending-link">
              承認待ちのピンをのぞく
              <span aria-hidden="true">{"\u00a0→"}</span>
            </Link>
            {/* SPEC §9.14-15/16: モバイルでも0件のとき投稿への導線を出す（札が小さいので灯りの子は出さない）。
                条件（絞り込みチップ・栞からの絞り込み）付きの0件は文言を分け、解除導線も出す。 */}
            {sortedSpots.length === 0 ? (
              <p className="map-head-empty">
                {originPending ? (
                  "いまいる場所をたしかめています…"
                ) : (
                  <>
                    {hasConditions
                      ? "その条件だと、見つかりませんでした。"
                      : "この街には、まだピンがありません。最初の一軒、立ててみませんか？"}
                    {hasConditions ? (
                      <button type="button" onClick={clearConditions} className="map-head-empty-link">
                        しぼりこみをはずす
                      </button>
                    ) : null}
                    <Link href={newSpotHref} transitionTypes={["page-forward"]} className="map-head-empty-link">
                      ピンを立てる
                    </Link>
                  </>
                )}
              </p>
            ) : null}
          </div>
          {/* 栞の丸: スマホの地図の画面では、下部タブの栞より、こちらへ栞のリボンが飛ぶ（data-lamp-prefer） */}
          <Link
            href="/bookmarks"
            aria-label="栞"
            transitionTypes={["page-forward"]}
            className="map-bm-btn"
            data-lamp-target="bookmarks"
            data-lamp-prefer=""
          >
            <span aria-hidden="true">栞</span>
          </Link>
        </div>

        <MapCanvas
          center={fallbackCenter}
          zoom={city.defaultZoom}
          pins={pins}
          selectedId={selectedId}
          onSelectPin={setSelectedId}
          onHoverPin={handleHoverPin}
          onBackgroundClick={() => setSelectedId(null)}
          fitToPins={Boolean(focusedSpotIds)}
          introKey={city.slug}
          // 右上のズームボタンは「栞」の丸ボタンと重なるため、.city-map で栞ボタンの下へずらす
          // （下部は選択カード・「＋ ピンを立てる」・出典が占めるので置かない）。
          className="absolute inset-0 city-map"
        />

        {/* 右下の「＋ ピンを立てる」（字の見えるピル。見える字がそのまま名前になる） */}
        <Link
          href={newSpotHref}
          transitionTypes={["page-forward"]}
          className="btn btn-primary map-add verb-stick keep-visible"
          style={{ "--d": "120ms", "--from-y": "16px", "--from-rot": "0deg" } as CSSProperties}
        >
          <span className="map-add-plus" aria-hidden="true">
            ＋
          </span>
          ピンを立てる
        </Link>

        {/* D1: 地図の上のホバーカード（付箋）「地元3人が確認・12日前」 */}
        <StillHoverCard ref={hoverCardRef} spots={filteredSpots} />

        {/* ピン選択時の下部カード（S2）: 徒歩N分・地元N人が確認／店名／一行説明／この店を読む＋栞に挟む。
            下から貼られ、別のピンでは中身だけ入れ替わり、地図の余白を押すとはがれる。 */}
        <AnimatePresence>
          {selectedSpot ? (
            <motion.div
              key="map-bcard"
              // 下から貼られる入りは CSS の animation（.map-bcard-slot）。押した瞬間に motion のスプリングを
              // 組み立てると、ピンを押してから次の描画までが 200ms を超えたため（P7 の INP の測定）。はがれる動きだけ motion
              className="map-bcard-slot"
              initial={false}
              exit={{ y: 16, opacity: 0, transition: reduced ? instant : { duration: 0.18, ease: EASE.peel } }}
            >
              <PresenceInert className="card map-bcard">
                <span className="tape tape-in map-bcard-tape" style={{ "--d": "120ms" } as CSSProperties} aria-hidden="true" />
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.div
                    key={selectedSpot.id}
                    initial={reduced ? false : { opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, transition: instant }}
                    transition={reduced ? instant : { duration: 0.16, ease: EASE.outSoft }}
                  >
                    <p className="map-bcard-kicker">
                      <Stamp
                        glyph={PIN_GLYPH[selectedSpot.quietness]}
                        tone={selectedSpot.quietness}
                        size={26}
                        tilt={tiltFromId(selectedSpot.id, 4)}
                      />
                      <span>{`${walkingLabel(distances[selectedSpot.id] ?? 0)}・地元${selectedSpot.verifierCount}人が確認`}</span>
                    </p>
                    <p className="map-bcard-name">{selectedSpot.name}</p>
                    <p className="map-bcard-desc">{selectedSpot.reason}</p>
                    <div className="map-bcard-btns">
                      <Link
                        href={`/${city.slug}/spots/${selectedSpot.id}`}
                        transitionTypes={["page-forward"]}
                        className="btn btn-primary"
                      >
                        この店を読む
                      </Link>
                      {/* 栞アクション（T5 所有の src/app/actions/bookmark-actions.ts に接続。
                          SPEC §9.12-5）。楽観更新後に Server Action を呼ぶ。 */}
                      <AddBookmarkButton
                        key={selectedSpot.id}
                        spotId={selectedSpot.id}
                        initiallyBookmarked={bookmarked.has(selectedSpot.id)}
                        variant="ghost"
                      />
                    </div>
                  </motion.div>
                </AnimatePresence>
              </PresenceInert>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
