"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { usePrefersReducedMotion } from "./motion-prefs";

/**
 * モーションリファレンス「リスト順次表示」（760ms）。
 * 各行が下から 8px・透明度0 から定位置へ。1行 340ms の ease-out、行ごとに 60ms ずつ遅らせ、
 * 8行目（index 7）で遅延を打ち止めにする（340 + 7×60 = 760ms。長い一覧で待たせない）。
 * 実際の動きは globals.css の `.motion-stagger-item`。
 */
export const STAGGER_STEP_MS = 60;
export const STAGGER_MAX_INDEX = 7;
export const STAGGER_ROW_MS = 340;
const STAGGER_TOTAL_MS = STAGGER_ROW_MS + STAGGER_STEP_MS * STAGGER_MAX_INDEX;

export interface StaggerRowProps {
  className: string;
  style: CSSProperties;
}

/**
 * 一覧の「初回表示」のときだけ順次表示のクラスを返す。
 * - 最初に行が1件以上そろった時点の並び（ID）を覚え、その行だけに付ける。
 * - 全体の再生時間が過ぎたらクラスを外す（最終状態と同じ見た目なので外しても揺れない）。
 *   以後の絞り込みの切り替え・栞を外したときの並び替え・ロールバックで戻った行では再生しない。
 * - `prefers-reduced-motion: reduce` のときは何も付けない。
 */
export function useIntroStagger(ids: readonly string[]): (id: string) => StaggerRowProps | undefined {
  const reduced = usePrefersReducedMotion();
  const [introIds, setIntroIds] = useState<readonly string[] | null>(ids.length > 0 ? ids : null);
  // 初回描画で行が無かった（位置の確定待ちなど）場合は、最初に行がそろった描画を「初回表示」とする。
  // effect ではなく、レンダー中に前回の状態と比べて調整する（React公式のパターン）。
  if (introIds === null && ids.length > 0) {
    setIntroIds(ids);
  }
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (introIds === null || done) return;
    const id = setTimeout(() => setDone(true), STAGGER_TOTAL_MS + 100);
    return () => clearTimeout(id);
  }, [introIds, done]);

  return (id: string) => {
    if (reduced || done || introIds === null) return undefined;
    const index = introIds.indexOf(id);
    if (index < 0) return undefined;
    return {
      className: "motion-stagger-item",
      style: { "--stagger-index": Math.min(index, STAGGER_MAX_INDEX) } as CSSProperties,
    };
  };
}
