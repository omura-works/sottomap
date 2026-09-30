// "use client" は付けない: 使う所（SearchScreen・CityMapScreen）がすでにクライアントの部品（SPEC motion §7.2-2）。
import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, usePresenceData } from "motion/react";
import type { Variants } from "motion/react";
import type { Spot } from "@/lib/db/types";
import type { StaggerRowProps } from "@/components/ui/useIntroStagger";
import { usePrefersReducedMotion } from "@/components/ui/motion-prefs";
import { cubicBezier, EASE } from "@/components/motion/tokens";

/** 行がこれより多いときは並べ替えを動かさない（即時に並ぶ。SPEC motion §5.3・§7.2-7）。 */
export const SINK_LAYOUT_MAX_ROWS = 40;
const SINK_MS = 560;
const ROW_ENTER = { duration: 0.24, ease: EASE.outSoft } as const;
const ROW_EXIT_S = 0.16;
const DIVIDER_KEY = "__sink-divider";

interface RowCustom {
  /** いま表示している行の id（出ていく行が、もう一方の一覧へ移っただけかを見分ける）。 */
  present: ReadonlySet<string>;
  /** 前の描画でも表示していた行か（もう一方の一覧から移ってきた行は、出てくる動きをしない）。 */
  moved: boolean;
  reduced: boolean;
}

function rowVariants(id: string): Variants {
  return {
    hidden: (c: RowCustom) => (c.moved || c.reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }),
    shown: (c: RowCustom) => ({ opacity: 1, y: 0, transition: c.reduced ? { duration: 0 } : ROW_ENTER }),
    // もう一方の一覧へ移っただけの行は、すぐに消える（移った先の行が元の位置から滑ってくる）
    gone: (c: RowCustom) => ({
      opacity: 0,
      transition: { duration: c.present.has(id) || c.reduced ? 0 : ROW_EXIT_S },
    }),
  };
}

interface SinkRowProps {
  id: string;
  custom: RowCustom;
  rowMotion?: StaggerRowProps;
  children: ReactNode;
}

function SinkRow({ id, custom, rowMotion, children }: SinkRowProps) {
  // 消えていく行はフォーカスの候補から外す（SPEC motion §6.3）
  const isPresent = useIsPresent();
  // もう一方の一覧へ移っただけの行は、はがれる間も見せない（移った先の行が元の位置から滑ってくるので、二重に見えないように）
  const exitData = usePresenceData() as RowCustom | undefined;
  const movedOut = !isPresent && (exitData?.present.has(id) ?? false);
  return (
    <motion.li
      data-row-id={id}
      custom={custom}
      variants={rowVariants(id)}
      initial="hidden"
      animate="shown"
      exit="gone"
      inert={!isPresent}
      className={rowMotion?.className}
      style={{ ...(rowMotion?.style as CSSProperties | undefined), visibility: movedOut ? "hidden" : undefined }}
    >
      {children}
    </motion.li>
  );
}

export interface SinkingRowsProps {
  /** 上の一覧（「まだ静か」ON なら静かな店だけ、OFF なら全部）。 */
  top: readonly Spot[];
  /** 区切りの下の一覧（「まだ静か」ON のときの混みはじめた店）。 */
  bottom: readonly Spot[];
  renderRow: (spot: Spot) => ReactNode;
  rowMotion?: (id: string) => StaggerRowProps | undefined;
  /** 区切りの見出しの段（検索は h2、地図の列は今の h4 のまま）。 */
  dividerHeading: "h2" | "h4";
}

/**
 * 「静かに下がる」一覧（SPEC motion §5.3）。「まだ静か」を ON にすると、混みはじめた店の行が区切りの下へゆっくり移る。
 * 上と下の2つの一覧をまたいで行が移るので、描画の前後の位置（包みからの上端）を比べ、差の分だけ `translate` で
 * 元の位置へ戻してから 560ms `--ease-sink` で新しい位置へ滑らせる（FLIP。motion の `layout` と同じ見え方）。
 * 動かすのは `translate` だけなので DOM の順番・フォーカス・ライブリージョンは変わらない。
 * 行が 40 を超えるとき・reduce のときは動かさない（即時に並ぶ）。
 */
export function SinkingRows({ top, bottom, renderRow, rowMotion, dividerHeading }: SinkingRowsProps) {
  const reduced = usePrefersReducedMotion();
  const total = top.length + bottom.length;
  const layoutOn = !reduced && total <= SINK_LAYOUT_MAX_ROWS;

  // 前の描画で表示していた行の id（React の「props が変わったら state を合わせる」形。effect を使わない）
  const ids = [...top, ...bottom].map((spot) => spot.id);
  const key = `${ids.join(",")}|${top.length}`;
  const [generation, setGeneration] = useState(() => ({ key, current: ids, previous: ids }));
  if (generation.key !== key) {
    setGeneration({ key, current: ids, previous: generation.current });
  }
  const present = new Set(ids);
  const previous = new Set(generation.previous);
  const customFor = (id: string): RowCustom => ({ present, moved: previous.has(id), reduced });
  const exitCustom: RowCustom = { present, moved: false, reduced };

  // FLIP: 描画のたびに各行と区切りの位置を覚え、次の描画で動いた物を元の位置から滑らせる
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const positionsRef = useRef<Map<string, number>>(new Map());
  const flightsRef = useRef<Map<string, Animation>>(new Map());
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const before = positionsRef.current;
    // 動いている途中の物は、いま見えている位置（前の位置＋今の translate）を覚えてから止める。
    // AnimatePresence は出ていく行を次の描画で流れの外へ出すので、1回の操作で2回続けて描画されることがある。
    const visibleBefore = new Map(before);
    flightsRef.current.forEach((flight, id) => {
      const target = flight.effect instanceof KeyframeEffect ? flight.effect.target : null;
      const old = before.get(id);
      if (target instanceof HTMLElement && old !== undefined) {
        const ty = Number.parseFloat(getComputedStyle(target).translate.split(" ")[1] ?? "0");
        if (Number.isFinite(ty)) visibleBefore.set(id, old + ty);
      }
      flight.cancel();
    });
    flightsRef.current.clear();
    const base = wrap.getBoundingClientRect().top;
    const next = new Map<string, number>();
    const elements = new Map<string, HTMLElement>();
    wrap.querySelectorAll<HTMLElement>("[data-row-id]").forEach((el) => {
      const id = el.dataset.rowId;
      if (!id || el.hasAttribute("inert")) return;
      next.set(id, el.getBoundingClientRect().top - base);
      elements.set(id, el);
    });
    positionsRef.current = next;
    if (!layoutOn || typeof Element.prototype.animate !== "function") return;
    for (const [id, top] of next) {
      const old = visibleBefore.get(id);
      if (old === undefined || Math.abs(old - top) < 1) continue;
      const el = elements.get(id);
      if (!el) continue;
      const flight = el.animate([{ translate: `0 ${old - top}px` }, { translate: "0 0" }], {
        duration: SINK_MS,
        easing: cubicBezier(EASE.sink),
      });
      flightsRef.current.set(id, flight);
    }
  });

  const DividerHeading = dividerHeading;
  const instant = { duration: 0 } as const;

  const rows = (list: readonly Spot[]) => (
    <AnimatePresence mode="popLayout" initial={false} custom={exitCustom}>
      {list.map((spot) => (
        <SinkRow key={spot.id} id={spot.id} custom={customFor(spot.id)} rowMotion={rowMotion?.(spot.id)}>
          {renderRow(spot)}
        </SinkRow>
      ))}
    </AnimatePresence>
  );

  return (
    <div ref={wrapRef} className="sinking-rows">
      <ul className="spot-rows" data-layout={layoutOn ? "on" : "off"}>
        {rows(top)}
      </ul>
      <AnimatePresence initial={false}>
        {bottom.length > 0 ? (
          <motion.div
            key="sink-divider"
            data-row-id={DIVIDER_KEY}
            className="sink-divider"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: reduced ? instant : { duration: 0.2 } }}
            exit={{ opacity: 0, transition: reduced ? instant : { duration: 0.16 } }}
          >
            {/* 区切りの点線は左から描かれる（v-draw-clip と同じ 420ms） */}
            <motion.span
              className="walk-dots"
              aria-hidden="true"
              initial={{ clipPath: "inset(0 100% 0 0)" }}
              animate={{ clipPath: "inset(0 0% 0 0)" }}
              transition={reduced ? instant : { duration: 0.42, ease: EASE.draw }}
            />
            <DividerHeading className="mini-heading">混みはじめた店</DividerHeading>
            <p className="sink-note">ここから下は、少しにぎやかになってきた店です。</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {bottom.length > 0 ? (
        <ul className="spot-rows spot-rows-sunk" data-layout={layoutOn ? "on" : "off"}>
          {rows(bottom)}
        </ul>
      ) : null}
    </div>
  );
}
