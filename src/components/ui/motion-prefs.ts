"use client";

import { useSyncExternalStore } from "react";

/**
 * `prefers-reduced-motion: reduce` の判定（モーションリファレンスの5つの動きで共通に使う）。
 * motion の `useReducedMotion` と同じメディアクエリを見る。
 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function getMediaQueryList(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(REDUCED_MOTION_QUERY);
}

/** 呼び出した時点で「動きを減らす」設定か（イベントハンドラや effect の中で使う）。 */
export function prefersReducedMotion(): boolean {
  return getMediaQueryList()?.matches ?? false;
}

function subscribe(onChange: () => void): () => void {
  const mql = getMediaQueryList();
  if (!mql || typeof mql.addEventListener !== "function") return () => {};
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * レンダー中に使う版。サーバー描画とハイドレーション中は「減らさない」（false）を返し、
 * その後クライアントの実際の設定に合わせて描き直す（ハイドレーションの不一致を起こさない）。
 * サーバー描画に付いた動きのクラスは、CSS 側の `@media (prefers-reduced-motion: reduce)` でも
 * 止めているため、描き直しまでの間に動いてしまうことはない。
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
