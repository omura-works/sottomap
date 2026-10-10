"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { City, Spot } from "@/lib/db/types";
import { Input } from "@/components/ui/Input";
import { useIntroStagger } from "@/components/ui/useIntroStagger";
import { buildDistanceMap, parseUrlOrigin, useResolvedOrigin, WITHIN_10MIN_METERS } from "@/components/map/geo";
import { sortSpots, splitByQuietness } from "@/lib/domain/ordering";
import { FilterChips } from "./FilterChips";
import { parseFiltersParam } from "./filters";
import { SpotRowLink } from "./SpotListItem";
import { SortNote } from "./SortNote";
import { SinkingRows } from "./SinkingRows";
import { PageLamp } from "@/components/motion/PageLamp";
import { BounceNumber } from "@/components/motion/BounceNumber";
import { LanternChild } from "@/components/illustrations/LanternChild";

export interface SearchScreenProps {
  city: City;
  /** listSpots が検索語・タグの絞り込みまで適用済みで返す（並び順・現在地依存の絞り込み・件数上限はクライアント側）。 */
  spots: Spot[];
  activeFilters: string[];
  query: string;
}

const SEARCH_DEBOUNCE_MS = 300;
/**
 * 最初に出す静かな店の数（SPEC §4 S3、2026-10-10 改訂。依頼者の判断「スマホで見やすい形なら何でもよい」）。
 * 残りは「もっと見る（あと N 軒）」で出す。混みはじめた店・観光地になった店は数に関係なく区切りの下に全部出す。
 */
export const SEARCH_INITIAL_QUIET = 5;
/** 「もっと見る」で増えた行が順に貼られる間隔（SPEC motion §3.5 の一覧のずらしと同じ）。 */
const MORE_STAGGER_MS = 45;

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
  // Codex R10 重要1: pathname ガードだけでは不十分（Next.js 16 は router state のコミット時に
  // URL を更新するため、遷移中も `usePathname`/`window.location.pathname` は検索画面のままになり得る）。
  // 利用者が別画面への遷移を「始めた瞬間」（リンクのクリック・戻る操作）にこのフラグを立て、
  // タイマーが発火してもデバウンス処理をしない。検索ページ内の操作（updateParams が呼ばれたとき）で戻す。
  const navigatingAwayRef = useRef(false);
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
      // Codex R10 重要1: 検索ページ内の操作（フィルタ操作・デバウンス正常発火）なので、
      // 別画面への遷移中フラグをリセットする。
      navigatingAwayRef.current = false;
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
    // Codex R11 軽微1: 検索欄に入力している＝この画面に留まっているので、遷移中フラグを戻す
    // （戻る操作や取り消されたリンク操作で true のまま残ると、以後の検索が反映されなくなるため）。
    navigatingAwayRef.current = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Codex R10 重要1: pathname ガードに加えて、利用者が別画面への遷移を始めていないかを見る。
      if (navigatingAwayRef.current) return;
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

  // Codex R10 重要1: 利用者が別画面への遷移を「始めた瞬間」（同一オリジンの `<a href>` クリック・
  // ブラウザの戻る操作）にデバウンスのタイマーを取り消す。Next.js 16 は router state のコミット時に
  // URL を更新するため、遷移が完了するまで pathname は検索画面のままになり得る
  // （タイマー発火時の pathname ガードだけでは間に合わない）。
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === pathname) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      navigatingAwayRef.current = true;
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname]);

  useEffect(() => {
    const handlePopState = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      navigatingAwayRef.current = true;
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
  // 並び順は必ず sortSpots を通す。見出し「近い順に{N}軒」は絞り込みの後の全部の件数（「もっと見る」で隠れている分も含む）。
  const allSpots = useMemo(
    () => (originPending ? [] : sortSpots(nearbySpots, distances)),
    [nearbySpots, distances, originPending],
  );

  // SPEC §9.14-5: 「まだ静か」ON時は quiet を上、crowding/touristy を「混みはじめた店」の下にまとめる。
  // OFF時は §9.5 の順のまま区切りなしで表示する。
  // SPEC §4 S3（2026-10-10）: 静かな店は近い順に最初の5軒だけ出し、残りは「もっと見る」で出す。
  // 混みはじめた店・観光地になった店は数に関係なく全部出す（ON なら区切りの下、OFF なら静かな店の後ろに区切りなしで）。
  // どちらでも同じ行が出ているので、ON/OFF を切り替えると「静かに下がる」で滑る。
  const quietNowActive = activeFilters.includes("quiet-now");
  const { quiet, crowded } = useMemo(() => splitByQuietness(allSpots), [allSpots]);
  const fullTop = quiet;
  // 結果（検索語・絞り込み・並び）が変わったら、また5軒に戻す（React公式の「props が変わったら state を合わせる」形）
  const allKey = allSpots.map((spot) => spot.id).join(",") + (quietNowActive ? "|q" : "|a");
  const [expanded, setExpanded] = useState<{ key: string; from: number } | null>(null);
  const [moreMessage, setMoreMessage] = useState("");
  if (expanded && expanded.key !== allKey) {
    setExpanded(null);
    setMoreMessage("");
  }
  const showAllTop = expanded !== null || fullTop.length <= SEARCH_INITIAL_QUIET;
  const shownQuiet = useMemo(() => (showAllTop ? fullTop : fullTop.slice(0, SEARCH_INITIAL_QUIET)), [showAllTop, fullTop]);
  const hiddenCount = fullTop.length - shownQuiet.length;
  // §9.5 の順（静けさ → 距離）なので、OFF のときも「静かな店 → 混みはじめた店」の順に1つの一覧で並ぶ
  const topList = useMemo(() => (quietNowActive ? shownQuiet : [...shownQuiet, ...crowded]), [quietNowActive, shownQuiet, crowded]);
  const bottomList = useMemo(() => (quietNowActive ? crowded : []), [quietNowActive, crowded]);
  const visibleSpots = useMemo(() => [...topList, ...bottomList], [topList, bottomList]);

  // Codex R9 重要2: 結果件数（の確定・変化）をライブリージョンで知らせる。
  // 位置解決待ちの間はその旨を、確定後は件数（0件なら既存の空状態文言に合わせる）を通知する。
  const statusMessage = originPending
    ? "現在地を確認しています…"
    : allSpots.length > 0
      ? `${allSpots.length}軒見つかりました`
      : "条件に合う店が見つかりませんでした。";

  // Codex R10 重要2: 結果のID並びが変わったら、件数（文言）が同じでも再通知する。
  // 栞（BookmarkList）と同じく、一度空にして次のティックで設定する
  // （同期的に空→本文をまとめて設定すると、DOM上は本文しか変化せず、直前と同じ文言のときは
  // 読み上げられない）。初回描画では即時に確定値を出す（テストや初期表示で待たせないため）。
  const resultKey = allSpots.map((spot) => spot.id).join(",");
  // モーションリファレンス「リスト順次表示」: 初回表示の結果だけ順に出す（絞り込みの切り替えでは再生しない）。
  const introMotion = useIntroStagger(visibleSpots.map((spot) => spot.id));
  // 「もっと見る」で増えた行は、上から順に貼られる（45ms ずつ。reduce では CSS 側で止まる）
  const moreIds = useMemo(
    () => (expanded ? new Map(fullTop.slice(expanded.from).map((spot, i) => [spot.id, i])) : null),
    [expanded, fullTop],
  );
  const rowMotion = useCallback(
    (id: string) => {
      const index = moreIds?.get(id);
      if (index === undefined) return introMotion(id);
      return {
        className: "verb-stick",
        style: { "--d": `${Math.min(index, 7) * MORE_STAGGER_MS}ms`, "--from-y": "-10px", "--from-rot": "0deg" } as CSSProperties,
      };
    },
    [moreIds, introMotion],
  );
  const [liveMessage, setLiveMessage] = useState(statusMessage);
  // 「もっと見る」を押したら、増えた最初の行へフォーカスを移し、増えた件数を読み上げる
  const firstMoreIdRef = useRef<string | null>(null);
  const showMore = useCallback(() => {
    firstMoreIdRef.current = fullTop[SEARCH_INITIAL_QUIET]?.id ?? null;
    setMoreMessage("");
    setExpanded({ key: allKey, from: SEARCH_INITIAL_QUIET });
    setTimeout(() => setMoreMessage(`あと${hiddenCount}軒を出しました`), 0);
  }, [fullTop, allKey, hiddenCount]);
  useEffect(() => {
    const id = firstMoreIdRef.current;
    if (!id || !expanded) return;
    firstMoreIdRef.current = null;
    const row = resultsContainerRef.current?.querySelector<HTMLElement>(`[data-row-id="${id}"] a`);
    row?.focus();
  }, [expanded]);
  const announceKeyRef = useRef(`${resultKey}|${statusMessage}`);
  useEffect(() => {
    const key = `${resultKey}|${statusMessage}`;
    if (announceKeyRef.current === key) return;
    announceKeyRef.current = key;
    setLiveMessage("");
    const id = setTimeout(() => setLiveMessage(statusMessage), 0);
    return () => clearTimeout(id);
  }, [resultKey, statusMessage]);

  // Codex R10 重要2: 位置解決で表示が街中心基準→現在地基準へ差し替わったときなど、
  // 表示中の一覧が変わったときに「結果内のどれかに実際にフォーカスがあり、かつその要素が
  // 消えた（isConnected===false）」場合に限って結果見出しへフォーカスを移す。
  // 結果内にフォーカスが無かった場合は何もしない（bodyでも移さない。以前は
  // `document.activeElement === document.body` で判定していたため、初回の待機中→確定でも
  // 常にフォーカスを奪ってしまっていた）。
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<Element | null>(null);
  const previousVisibleIdsRef = useRef<string[] | null>(null);

  useEffect(() => {
    const container = resultsContainerRef.current;
    if (!container) return;
    const handleFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Element) {
        lastFocusedRef.current = event.target;
      }
    };
    const handleFocusOut = (event: FocusEvent) => {
      const related = event.relatedTarget;
      if (related instanceof Node && container.contains(related)) return; // 結果内で移動しただけ
      if (related !== null) {
        // 結果の外（検索欄など、まだ存在する要素）へ意図して移った場合は追跡をやめる。
        lastFocusedRef.current = null;
      }
      // related === null（要素の削除などでフォーカス先が無い）の場合は isConnected 判定用に保持する。
    };
    container.addEventListener("focusin", handleFocusIn);
    container.addEventListener("focusout", handleFocusOut);
    return () => {
      container.removeEventListener("focusin", handleFocusIn);
      container.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  useEffect(() => {
    const currentIds = visibleSpots.map((spot) => spot.id);
    const previousIds = previousVisibleIdsRef.current;
    previousVisibleIdsRef.current = currentIds;
    if (previousIds === null) return; // 初回描画ではフォーカスを奪わない。
    if (previousIds.join(",") === currentIds.join(",")) return;
    const lastFocused = lastFocusedRef.current;
    // 退場中の行（`SinkingRows` が退場の間 inert にする）にあったフォーカスも「消えた」とみなす
    if (lastFocused && (!lastFocused.isConnected || lastFocused.closest("[inert]") !== null)) {
      // Codex R11 重要1: 救済したら追跡をやめる（残すと、利用者が検索欄へ戻った後の次の更新でも
      // 切断済みの古い要素を再検出して、見出しへフォーカスを奪い続けてしまう）。
      lastFocusedRef.current = null;
      headingRef.current?.focus();
    }
  }, [visibleSpots]);

  return (
    <div className="search-screen mx-auto max-w-xl lg:max-w-2xl px-4 py-4 lg:py-8 space-y-4">
      {/* SPEC §9.14-9: 検索画面の見出しはDOMの先頭にh1を置き、下位見出しはh2に整理する。
          Codex R9 重要2: tabIndex=-1 にして、結果差し替えでフォーカスが消えたときの移動先にする。
          SPEC motion §5.3: 件数の数字がこの画面の山（--fs-giant）。変わると桁が回り、止まったら跳ねる。 */}
      <h1 ref={headingRef} tabIndex={-1} className="search-h1">
        <span className={originPending ? "search-h1-pending" : "search-h1-word"}>
          <PageLamp />
          {originPending ? "いまいる場所をたしかめています…" : "近い順に"}
        </span>
        {originPending ? null : (
          <>
            <span className="search-h1-num verb-pop" style={{ "--d": "200ms" } as CSSProperties}>
              <BounceNumber value={allSpots.length} />
            </span>
            <span className="search-h1-word">軒</span>
          </>
        )}
      </h1>
      <p className="search-lead">気になる条件を、ぽちぽち選んでみてください。</p>

      {/* Codex R9 重要2・R10 重要2: 結果が確定・変化したことを常設のライブリージョンで通知する。 */}
      <p role="status" aria-live="polite" className="sr-only">
        {moreMessage || liveMessage}
      </p>

      <div className="search-field">
        <svg className="search-field-mag" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true" focusable="false">
          <circle cx={11} cy={11} r={6} />
          <path d="m20 20-4.5-4.5" />
        </svg>
        <Input
          type="search"
          underline
          className="search-field-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={`${city.name}の店をさがす`}
          aria-label={`${city.name}の店をさがす`}
        />
      </div>

      <div className="search-filters">
        <h2 className="mini-heading">しぼりこむ</h2>
        <FilterChips active={activeFilters} onToggle={toggleFilter} />
      </div>

      <div className="search-results" aria-busy={isPending} ref={resultsContainerRef}>
        {/* 待ちの行は高さを常に取っておく（出たり消えたりで一覧が上下に跳ねないように） */}
        <p className="search-pending" data-on={isPending ? "true" : "false"}>
          {isPending ? (
            <>
              <span className="search-pending-lamp" aria-hidden="true" />
              さがしています…
            </>
          ) : null}
        </p>

        {originPending ? (
          <p className="text-muted text-sm m-0">いまいる場所をたしかめています…</p>
        ) : (
          <>
            <SinkingRows
              top={topList}
              bottom={bottomList}
              rowMotion={rowMotion}
              dividerHeading="h2"
              renderRow={(spot) => <SpotRowLink spot={spot} distanceMeters={distances[spot.id]} />}
              afterTop={
                hiddenCount > 0 ? (
                  <button type="button" className="btn btn-secondary search-more" onClick={showMore}>
                    もっと見る（あと{hiddenCount}軒）
                  </button>
                ) : null
              }
            />

            {allSpots.length === 0 ? (
              <div className="empty-state">
                <LanternChild size={48} />
                <p className="empty-state-big">その条件だと、見つかりませんでした</p>
                <p className="empty-state-small">チップを1つはずしてみてください。</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-secondary" onClick={clearConditions}>
                    しぼりこみをはずす
                  </button>
                  <Link href={`/${city.slug}/spots/new`} transitionTypes={["page-forward"]} className="btn btn-secondary">
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
