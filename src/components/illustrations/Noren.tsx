// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden・focusable="false"。
import type { CSSProperties } from "react";

export interface NorenProps {
  /** 幅（px、既定 160）。高さは 160:72 から決まる。 */
  width?: number;
  className?: string;
  style?: CSSProperties;
}

/** 布3枚の左端の x。 */
export const NOREN_CLOTH_X = [10, 58, 106] as const;

/** 布1枚（幅44・高さ58、下端を少し丸く）。 */
export function norenClothPath(x: number): string {
  return `M${x} 10 h44 v54 q0 4 -4 4 h-36 q-4 0 -4 -4 Z`;
}

/** 暖簾（SPEC motion §2.10）。布ごとに `.noren-cloth`（transform-origin は上の真ん中）でゆらせる。 */
export function Noren({ width = 160, className, style }: NorenProps) {
  return (
    <svg
      className={["noren", className].filter(Boolean).join(" ")}
      style={style}
      width={width}
      height={(width * 72) / 160}
      viewBox="0 0 160 72"
      aria-hidden="true"
      focusable="false"
    >
      <rect x={4} y={2} width={152} height={6} rx={3} fill="var(--color-neutral-800)" />
      {NOREN_CLOTH_X.map((x) => (
        <path key={x} className="noren-cloth" d={norenClothPath(x)} fill="var(--color-accent-2-700)" />
      ))}
    </svg>
  );
}
