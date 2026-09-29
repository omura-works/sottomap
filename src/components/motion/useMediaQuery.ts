"use client";

import { useSyncExternalStore } from "react";

/**
 * メディアクエリの今の答え。サーバー描画とハイドレーション中は serverValue を返し、その後の描画で実際の値に合わせる
 * （ハイドレーションの不一致を起こさない）。
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener?.("change", onChange);
      return () => mql.removeEventListener?.("change", onChange);
    },
    () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}

/** PC（左ナビのある 1024px 以上）か。 */
export const DESKTOP_QUERY = "(min-width: 1024px)";
