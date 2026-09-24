"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { prefersReducedMotion } from "@/components/ui/motion-prefs";

/**
 * モーションリファレンス「タブインジケーター」（520ms・easeOutCubic）。
 * 選択中のタブの文字に沿わせた線を、タブを移ると「いったん移動先の方向へ伸びて（前後のタブを
 * 覆う長さ）から、移動先の文字幅に合わせて縮んで止まる」ように動かす。
 * 動かすのは transform（translate と scale）だけ。線は `.motion-tab-indicator`（幅100px）を
 * scale で文字の長さに合わせる。
 * - `axis: "x"`: 下部タブ。文字の下に横線（文字幅に合わせる）。
 * - `axis: "y"`: デスクトップのサイドレール。項目の左に縦線（文字の高さに合わせる）。
 * `prefers-reduced-motion: reduce` のとき、初回配置、画面サイズの変化では動かさずに置くだけ。
 */
export const TAB_INDICATOR_MS = 520;
const TAB_INDICATOR_EASING = "cubic-bezier(0.33, 1, 0.68, 1)";
/** 伸びきる位置（全体の進み具合に対する割合）。 */
const STRETCH_OFFSET = 0.45;
/** `.motion-tab-indicator` の基準の長さ（px）。 */
const BASE_LENGTH = 100;
/** 文字と線の間隔（px）。 */
const GAP = 3;

interface Span {
  /** 主軸（x なら左端、y なら上端）の位置 */
  start: number;
  /** 主軸方向の長さ */
  length: number;
  /** 交差軸の位置（x なら線の上端、y なら線の左端） */
  cross: number;
}

function toTransform(axis: "x" | "y", span: Span): string {
  const scale = span.length / BASE_LENGTH;
  return axis === "x"
    ? `translate(${span.start}px, ${span.cross}px) scaleX(${scale})`
    : `translate(${span.cross}px, ${span.start}px) scaleY(${scale})`;
}

export function useTabIndicator<K extends string>(axis: "x" | "y", activeKey: K | null) {
  const containerRef = useRef<HTMLElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const labelRefs = useRef(new Map<K, HTMLElement | null>());
  const previousRef = useRef<{ key: K; span: Span } | null>(null);

  const measure = useCallback(
    (key: K): Span | null => {
      const container = containerRef.current;
      const label = labelRefs.current.get(key);
      if (!container || !label) return null;
      const c = container.getBoundingClientRect();
      const r = label.getBoundingClientRect();
      if (axis === "x") {
        return { start: r.left - c.left, length: r.width, cross: r.bottom - c.top + GAP };
      }
      const link = label.closest("a") ?? label;
      const l = link.getBoundingClientRect();
      return { start: r.top - c.top, length: r.height, cross: l.left - c.left - GAP - 2 };
    },
    [axis],
  );

  const place = useCallback(
    (animate: boolean) => {
      const indicator = indicatorRef.current;
      if (!indicator) return;
      const span = activeKey ? measure(activeKey) : null;
      if (!activeKey || !span || span.length === 0) {
        indicator.style.opacity = "0";
        previousRef.current = null;
        return;
      }
      const to = toTransform(axis, span);
      const previous = previousRef.current;
      indicator.style.transform = to;
      indicator.style.opacity = "1";
      if (
        animate &&
        previous &&
        previous.key !== activeKey &&
        !prefersReducedMotion() &&
        typeof indicator.animate === "function"
      ) {
        // 移動先の方向へ、前のタブの端から移動先のタブの端まで伸ばした形を中間点にする。
        const forward = span.start >= previous.span.start;
        const stretchStart = forward ? previous.span.start : span.start;
        const stretchEnd = forward ? span.start + span.length : previous.span.start + previous.span.length;
        const stretched: Span = { start: stretchStart, length: stretchEnd - stretchStart, cross: span.cross };
        indicator.animate(
          [
            { transform: toTransform(axis, previous.span), offset: 0 },
            { transform: toTransform(axis, stretched), offset: STRETCH_OFFSET },
            { transform: to, offset: 1 },
          ],
          { duration: TAB_INDICATOR_MS, easing: TAB_INDICATOR_EASING },
        );
      }
      previousRef.current = { key: activeKey, span };
    },
    [activeKey, axis, measure],
  );

  // 選択中のタブが変わったら動かす（初回は置くだけ）。
  useLayoutEffect(() => {
    place(true);
  }, [place]);

  // 画面サイズやフォントの読み込みで文字の位置が変わったら、動かさずに置き直す。
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(container);
    return () => observer.disconnect();
  }, [place]);

  const registerLabel = useCallback(
    (key: K) => (node: HTMLElement | null) => {
      labelRefs.current.set(key, node);
    },
    [],
  );

  return { containerRef, indicatorRef, registerLabel };
}
