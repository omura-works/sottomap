// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden・focusable="false"。
import type { CSSProperties } from "react";

export interface EnvelopeProps {
  /** 幅（px、既定 48）。高さは 48:36 から決まる。 */
  width?: number;
  className?: string;
  style?: CSSProperties;
}

/** 封筒（SPEC motion §2.10）。ふた（`.envelope-flap`）は上辺を軸に閉じる動きを付けられる。 */
export function Envelope({ width = 48, className, style }: EnvelopeProps) {
  return (
    <svg
      className={["envelope", className].filter(Boolean).join(" ")}
      style={style}
      width={width}
      height={(width * 36) / 48}
      viewBox="0 0 48 36"
      overflow="visible"
      aria-hidden="true"
      focusable="false"
    >
      <rect x={2} y={6} width={44} height={28} rx={4} fill="var(--color-neutral-100)" stroke="var(--color-accent-600)" strokeWidth={2} />
      <path
        className="envelope-flap"
        d="M2 8 L24 22 L46 8"
        fill="var(--color-neutral-100)"
        stroke="var(--color-accent-600)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
