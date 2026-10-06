"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { unstable_rethrow } from "next/navigation";
import { removeBookmarkAction } from "@/app/actions/bookmark-actions";
import { ConfirmRemoveButton, useIntroStagger } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { usePrefersReducedMotion } from "@/components/ui/motion-prefs";
import { useLamp } from "@/components/motion/LampLayer";
import { setIrisOrigin } from "@/components/motion/iris";
import { EASE, SPRING } from "@/components/motion/tokens";
import { LampDots } from "@/components/illustrations/LampDots";
import { LanternChild } from "@/components/illustrations/LanternChild";
import { Lantern } from "@/components/illustrations/Lantern";
import { Ribbon } from "@/components/illustrations/Ribbon";
import { RoadLines } from "@/components/illustrations/RoadLines";

/** ページ側（`/bookmarks`）の見出し。行の前後どちらも無いときのフォーカス先（Codex R8 重要3）。 */
const BOOKMARKS_HEADING_ID = "bookmarks-heading";
/** 行が多いときは、外したあとのすき間を詰める動き（layout）を付けない（SPEC motion §7.2-7）。 */
const LAYOUT_MAX_ROWS = 40;
/** 「地図にまとめる」でボタンへ吸い込まれるリボンの数・ずらし・時間（SPEC motion §5.5）。 */
const GATHER_MAX = 6;
const GATHER_STEP_MS = 30;
const GATHER_MS = 360;

export interface BookmarkListItem {
  id: string;
  spotId: string;
  citySlug: string;
  cityName: string;
  areaName: string | null;
  spotName: string;
  photoUrl: string | null;
  plannedAt: string | null;
  meta: string;
}

type ListAction =
  | { type: "remove"; id: string }
  | { type: "restore"; item: BookmarkListItem; index: number };

/**
 * S8「挟んだ店」のリスト＋「N軒を地図にまとめる」導線。
 * 削除は Server Action（`removeBookmarkAction`）＋ `useOptimistic` で
 * 即座にリストから消し、失敗時は元の位置に戻して `role="alert"` で知らせる
 * （SPEC §9.14-7）。
 *
 * 「N軒を地図にまとめる」は、栞が単一の街だけなら「N軒を地図にまとめる」のまま。
 * 複数の街にまたがるときは街ごとにボタンを分け、「{街名}のN軒を地図にまとめる」とする
 * （SPEC §9.14-4: 表示件数と渡す件数を一致させる）。
 *
 * Codex R8 重要3: 「外す」確定で行自体がアンマウントされるため、`ConfirmRemoveButton` 内蔵の
 * ライブリージョンではなく、行が消えても残るこの一覧レベルのライブリージョンで
 * 「栞から外しました。」「そのままにしました。」を知らせる。フォーカスは、外した直後は
 * 次の行→無ければ前の行→どちらも無ければ一覧の見出しへ、ロールバック時は復元した行の
 * 「外す」ボタンへ移す。
 *
 * 2026-09-26 案B: ページの見出し（`header`）と「地図にまとめる」を、暗い角丸カード（.night-card）の中に並べる。
 * 店のリストはカードの外（明るい地）。
 */
export function BookmarkList({ initialItems, header }: { initialItems: BookmarkListItem[]; header?: ReactNode }) {
  const [, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const [items, dispatch] = useOptimistic(initialItems, (state: BookmarkListItem[], action: ListAction) => {
    if (action.type === "remove") {
      return state.filter((item) => item.id !== action.id);
    }
    if (action.type === "restore") {
      const next = state.slice();
      next.splice(Math.min(action.index, next.length), 0, action.item);
      return next;
    }
    return state;
  });

  // ロールバックで復元された行が再マウントされ、ref が登録されてから初めてフォーカスできる。
  useEffect(() => {
    if (!pendingFocusId) return;
    const target = triggerRefs.current.get(pendingFocusId);
    if (target) {
      target.focus();
      setPendingFocusId(null);
    }
  }, [pendingFocusId, items]);

  function focusNeighborOrHeading(nextId: string | undefined, prevId: string | undefined) {
    const target =
      (nextId && triggerRefs.current.get(nextId)) || (prevId && triggerRefs.current.get(prevId)) || null;
    if (target) {
      target.focus();
    } else {
      document.getElementById(BOOKMARKS_HEADING_ID)?.focus();
    }
  }

  // Codex R9 重要3: 同じ文言が連続しても読み上げられるよう、一度空にしてから
  // 次のティックで設定する（同期的に空→本文をまとめて設定すると、DOM上は本文しか
  // 変化せず、直前と同じ文言のときは再読み上げされない）。
  function announce(message: string) {
    setLiveMessage("");
    setTimeout(() => setLiveMessage(message), 0);
  }

  function handleRemove(item: BookmarkListItem, index: number) {
    const nextId = items[index + 1]?.id;
    const prevId = index > 0 ? items[index - 1]?.id : undefined;
    setErrorMessage(null);
    startTransition(async () => {
      dispatch({ type: "remove", id: item.id });
      focusNeighborOrHeading(nextId, prevId);
      try {
        // Codex R9 重要3: 成功通知はServer Actionの成功後に出す（失敗時に「外しました」を出さないため）。
        await removeBookmarkAction(item.spotId);
        announce(`${item.spotName}を栞から外しました。`);
      } catch (error) {
        // 未ログイン時の Server Action redirect は Next.js に処理させる。
        unstable_rethrow(error);
        dispatch({ type: "restore", item, index });
        setErrorMessage("ごめんなさい、栞から外せませんでした。もう一度ためしてみてください。");
        setPendingFocusId(item.id);
      }
    });
  }

  function handleCancel(item: BookmarkListItem) {
    announce(`${item.spotName}はそのままにしました。`);
  }

  // モーションリファレンス「リスト順次表示」: 初回表示の行だけ順に出す。
  // 外したときの並び替えやロールバックで戻った行では再生しない（フォーカス移動は上のまま）。
  const rowMotion = useIntroStagger(items.map((item) => item.id));

  const cityOrder: string[] = [];
  const itemsByCity = new Map<string, BookmarkListItem[]>();
  for (const item of items) {
    if (!itemsByCity.has(item.citySlug)) {
      cityOrder.push(item.citySlug);
      itemsByCity.set(item.citySlug, []);
    }
    itemsByCity.get(item.citySlug)!.push(item);
  }

  const reduced = usePrefersReducedMotion();
  const layoutOn = !reduced && items.length <= LAYOUT_MAX_ROWS;
  const lamp = useLamp();
  // 前の描画に無かった行（外せずに戻った行）だけ、元の位置へ貼り直す動きを付ける
  // （React の「props が変わったら state を合わせる」形。effect を使わない）
  const idsKey = items.map((item) => item.id).join(",");
  const [seen, setSeen] = useState(() => ({ key: idsKey, ids: new Set(initialItems.map((item) => item.id)) as ReadonlySet<string>, previous: new Set(initialItems.map((item) => item.id)) as ReadonlySet<string> }));
  if (seen.key !== idsKey) {
    setSeen({ key: idsKey, ids: new Set(items.map((item) => item.id)), previous: seen.ids });
  }

  // 「地図にまとめる」: 見えている行のリボン（その街の、上から6本まで）がボタンへ吸い込まれ、ボタンが弾む。
  // 遷移（アイリス）は押した瞬間に始める（吸い込みを待たない）。
  function gather(event: MouseEvent<HTMLAnchorElement>, citySlug: string | null) {
    const button = event.currentTarget;
    const ribbons = Array.from(document.querySelectorAll<HTMLElement>("[data-bm-ribbon]"))
      .filter((el) => citySlug === null || el.dataset.bmRibbon === citySlug)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
      })
      .slice(0, GATHER_MAX);
    ribbons.forEach((ribbon, i) => {
      lamp.fly(ribbon, button, {
        kind: "ribbon",
        duration: GATHER_MS,
        delay: i * GATHER_STEP_MS,
        onArrive: i === ribbons.length - 1 ? () => lamp.bump(button) : undefined,
      });
    });
    setIrisOrigin(button);
  }

  const gatherLink = (href: string, label: string, citySlug: string | null, first: boolean) => (
    <Link
      key={href}
      href={href}
      transitionTypes={["lamp-iris"]}
      onClick={(event) => gather(event, citySlug)}
      className="btn btn-on-night btn-lg"
      data-lamp-target={first ? "map-button" : undefined}
    >
      {label}
      <NightArrow />
    </Link>
  );

  return (
    <div className="bm-screen">
      {header || items.length > 0 ? (
        <div className="night-card bm-night">
          {/* 飾り: 道の線・右上の暖色のにじみ・灯りの点6つ・上辺から垂れる大きなリボン */}
          <div aria-hidden="true" className="bm-night-deco">
            <RoadLines />
            <span className="night-glow" style={{ width: 360, height: 360, right: -120, top: -140 }} />
            <LampDots count={6} ignite />
          </div>
          <span className="bm-big-ribbon-box" aria-hidden="true">
            <Ribbon width={24} height={96} className="bm-big-ribbon verb-tuck" />
          </span>
          {header ? <div className="relative">{header}</div> : null}
          {items.length > 0 ? (
            // 街ごとのボタンは縦に積む。横に並べると、Zen Maru の 700 が届いた瞬間に字の幅が変わって折り返しが変わり、
            // 下の一覧がずれていた（PC 1280 で CLS 0.054。P7 の測定）
            <div className="bm-gather relative flex flex-col items-start gap-3">
              {cityOrder.length <= 1
                ? gatherLink(`/${cityOrder[0]}?spots=${items.map((item) => item.spotId).join(",")}`, `${items.length}軒を地図にまとめる`, null, true)
                : cityOrder.map((citySlug, i) => {
                    const cityItems = itemsByCity.get(citySlug)!;
                    const cityName = cityItems[0].cityName;
                    const spotIds = cityItems.map((item) => item.spotId).join(",");
                    return gatherLink(`/${citySlug}?spots=${spotIds}`, `${cityName}の${cityItems.length}軒を地図にまとめる`, citySlug, i === 0);
                  })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Codex R9 重要3: 0件（早期return）でも常に描画する。行が消えても残るライブリージョン
          （Codex R8 重要3）。ConfirmRemoveButton 側は持たない。 */}
      <p role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {items.length === 0 ? (
        <div className="empty-state">
          <LanternChild size={48} />
          <p className="empty-state-big">まだ、栞に挟んだ店はありません</p>
          <p className="empty-state-small">気になる店を見つけたら「栞に挟む」を押してみてね。地図の上でも光るようになります。</p>
        </div>
      ) : (
        <ul className="bm-list">
          <AnimatePresence mode="popLayout" initial={false}>
            {items.map((item, index) => {
              const intro = rowMotion(item.id);
              return (
                <BookmarkRow
                  key={item.id}
                  className={intro?.className}
                  style={intro?.style}
                  layoutOn={layoutOn}
                  reduced={reduced}
                  restored={!seen.previous.has(item.id)}
                  ribbonTuck={Boolean(intro)}
                  citySlug={item.citySlug}
                >
                  <span className="spot-thumb bm-thumb" aria-hidden={item.photoUrl ? undefined : true}>
                    {item.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 外部URLのサムネイルをそのまま表示する
                      <img src={item.photoUrl} alt={item.spotName} className="spot-thumb-photo" />
                    ) : null}
                  </span>
                  <div className="spot-row-text">
                    <p className="spot-row-name">{item.spotName}</p>
                    <p className="spot-row-meta">{item.meta}</p>
                  </div>
                  <ConfirmRemoveButton
                    label={`${item.spotName}を栞から外す`}
                    onConfirm={() => handleRemove(item, index)}
                    onCancel={() => handleCancel(item)}
                    onTriggerRef={(node) => {
                      triggerRefs.current.set(item.id, node);
                    }}
                  />
                </BookmarkRow>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {errorMessage ? (
        <p role="alert" className="inline-alert alert-in text-sm">
          <Lantern size={16} tone="paper" />
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

interface BookmarkRowProps {
  className?: string;
  style?: CSSProperties;
  layoutOn: boolean;
  reduced: boolean;
  /** 外せずに戻った行（元の位置へ貼り直す。透明にはしない）。 */
  restored: boolean;
  /** 最初の表示で、行が貼られた 120ms 後にリボンが挟まる。false なら挟まった状態で出す。 */
  ribbonTuck: boolean;
  citySlug: string;
  children: ReactNode;
}

/**
 * 栞の1行（SPEC motion §5.5）。左端のリボンは最初の表示で挟まり、外すとリボンが上へ抜けて行がはがれる。
 * はがれている間は inert（フォーカスはすでに隣へ移っている）。下の行はすき間を詰める。
 */
function BookmarkRow({ className, style, layoutOn, reduced, restored, ribbonTuck, citySlug, children }: BookmarkRowProps) {
  const isPresent = useIsPresent();
  const instant = { duration: 0 } as const;
  return (
    <motion.li
      layout={layoutOn ? "position" : false}
      initial={restored && !reduced ? { y: -8 } : false}
      animate={{ y: 0, opacity: 1, rotate: 0 }}
      exit={reduced ? { opacity: 0, transition: instant } : { opacity: 0, y: -8, rotate: 2.5, transition: { duration: 0.2, ease: EASE.peel } }}
      transition={reduced ? instant : { layout: SPRING.settle, y: SPRING.settle }}
      inert={!isPresent}
      data-leaving={isPresent ? undefined : "true"}
      className={cn("bm-row", className)}
      style={style as CSSProperties | undefined}
    >
      <span className="bm-row-ribbon-box" aria-hidden="true" data-bm-ribbon={citySlug}>
        <Ribbon width={10} height={32} className={cn("bm-row-ribbon", ribbonTuck ? "verb-tuck" : null)} />
      </span>
      {children}
    </motion.li>
  );
}

/** 「地図にまとめる」の右の橙の矢印（読み上げない）。 */
function NightArrow() {
  return (
    <span aria-hidden="true" style={{ color: "var(--color-accent-600)" }}>
      →
    </span>
  );
}
