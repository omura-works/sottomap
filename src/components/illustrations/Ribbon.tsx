// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden・押せない。
import type { CSSProperties } from "react";

export interface RibbonProps {
  /** 幅（px）。 */
  width: number;
  /** 長さ（px）。 */
  height: number;
  className?: string;
  style?: CSSProperties;
}

/** 栞のリボン（下端が燕尾に切れた accent-600 の帯）。挟む動きは親の `overflow: clip` の箱と `.verb-tuck` で。 */
export function Ribbon({ width, height, className, style }: RibbonProps) {
  return (
    <span
      className={["ribbon", className].filter(Boolean).join(" ")}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}
