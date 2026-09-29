// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden・focusable="false"。
import type { CSSProperties } from "react";
import { useSvgId } from "./svg-id";

export interface LanternProps {
  /** 高さ（px）。幅は 40:52 から決まる。 */
  size?: number;
  /** 光の層が点いているか。 */
  lit?: boolean;
  /** 線の色: 夜の上は accent-300、紙の上は accent-600。 */
  tone?: "night" | "paper";
  className?: string;
  style?: CSSProperties;
}

/**
 * 提灯（SPEC motion §2.10）。胴の中の光の層（`.lantern-glow`）の opacity で「灯る」。
 * 灯る・消える・呼吸の動きは CSS（`.lantern[data-lit]` と各画面の指定）で付ける。
 */
export function Lantern({ size = 52, lit = false, tone = "night", className, style }: LanternProps) {
  const glowId = useSvgId("lantern");
  const line = tone === "night" ? "var(--color-accent-300)" : "var(--color-accent-600)";
  return (
    <svg
      className={["lantern", className].filter(Boolean).join(" ")}
      data-lit={lit ? "true" : "false"}
      style={style}
      width={(size * 40) / 52}
      height={size}
      viewBox="0 0 40 52"
      overflow="visible"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={glowId}>
          <stop offset="0" stopColor="var(--color-accent-400)" stopOpacity={0.7} />
          <stop offset="1" stopColor="var(--color-accent-400)" stopOpacity={0} />
        </radialGradient>
      </defs>
      <ellipse className="lantern-glow" cx={20} cy={27} rx={18} ry={21} fill={`url(#${glowId})`} />
      <g fill="none" stroke={line} strokeWidth={1.8}>
        <rect x={13} y={3} width={14} height={5} rx={2} />
        <ellipse cx={20} cy={27} rx={14} ry={17} />
        <path d="M8 20 Q20 16 32 20" />
        <path d="M8 34 Q20 38 32 34" />
        <rect x={14} y={43} width={12} height={5} rx={2} />
      </g>
    </svg>
  );
}
