"use client";

import { useEffect, useRef, useState } from "react";
import { LazyAnimatedCounter } from "@/components/ui/LazyAnimatedCounter";
import type { AnimatedCounterProps } from "@/components/ui/AnimatedCounter";
import { prefersReducedMotion } from "@/components/ui/motion-prefs";

export type BounceNumberProps = AnimatedCounterProps;

/**
 * 変わった数字が止まったら1回跳ねる（SPEC motion §2.3・§5.1・§5.3・§5.5）。
 * 今の `AnimatedCounter`（桁が回る・sr-only の数字で読み上げる）を包み、値が変わって桁が止まったころ
 * （`duration` 秒後）に `v-bump`（450ms）を1回再生する。読み上げの要素は増やさない。
 * - 最初の描画では跳ねない（0 から数え上げもしない）。
 * - 続けて変わったときも毎回再生できるよう、2つの同じ中身のアニメーション名（a / b）を交互に使う。
 * - reduce では跳ねない（桁の回転も AnimatedCounter 側で即時）。
 */
export function BounceNumber({ value, duration = 0.6, className, ...props }: BounceNumberProps) {
  const [bump, setBump] = useState<"a" | "b" | null>(null);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    if (prefersReducedMotion()) return;
    const timer = setTimeout(() => setBump((current) => (current === "a" ? "b" : "a")), Math.max(0, duration) * 1000);
    return () => clearTimeout(timer);
  }, [value, duration]);

  return (
    <span className={bump ? "bounce-number is-bumping" : "bounce-number"} data-bump={bump ?? undefined}>
      <LazyAnimatedCounter value={value} duration={duration} className={className} {...props} />
    </span>
  );
}
