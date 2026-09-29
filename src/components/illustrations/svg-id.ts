import { useId } from "react";

/**
 * SVG の中の参照（`url(#…)`）に使う id。React の useId は記号を含むことがあるので英数字だけにする。
 * 同じ挿絵が1画面に複数あっても（片方が display: none でも）参照が迷子にならないよう、部品ごとに別の id を使う。
 */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
