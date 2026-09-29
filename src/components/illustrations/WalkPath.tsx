// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden・focusable="false"。
import type { CSSProperties } from "react";
import { useSvgId } from "./svg-id";

export interface WalkPathProps {
  /** 道の形（置き場所ごとに渡す）。 */
  d: string;
  /** 座標系。 */
  viewBox: string;
  preserveAspectRatio?: string;
  className?: string;
  style?: CSSProperties;
  /** 点の色。既定は紙の上の neutral-400。夜の上なら `color-mix(in srgb, var(--color-neutral-100) 30%, transparent)`。 */
  color?: string;
  /** 見える範囲が伸びていく「描く」入場を付ける（点線そのものは止まったまま）。 */
  draw?: boolean;
  delay?: number;
  /** 描く長さ（ミリ秒、既定 700。長い道は 900 まで）。 */
  duration?: number;
}

/**
 * 散歩道の点線（SPEC motion §2.10）。丸い点を 14 間隔で並べる。「描く」は同じ形の太い実線を mask にし、
 * その実線の `stroke-dashoffset` を 1→0 にする（点線は動かず、見える範囲だけが伸びる）。
 */
export function WalkPath({
  d,
  viewBox,
  preserveAspectRatio,
  className,
  style,
  color = "var(--color-neutral-400)",
  draw = false,
  delay = 0,
  duration,
}: WalkPathProps) {
  const maskId = useSvgId("walk");
  return (
    <svg
      className={["walk-path", className].filter(Boolean).join(" ")}
      style={style}
      viewBox={viewBox}
      preserveAspectRatio={preserveAspectRatio}
      overflow="visible"
      aria-hidden="true"
      focusable="false"
    >
      {draw ? (
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <path
            d={d}
            pathLength={1}
            fill="none"
            stroke="#fff"
            strokeWidth={12}
            strokeLinecap="round"
            className="verb-draw"
            style={{ "--d": `${delay}ms`, ...(duration ? { "--dur-draw": `${duration}ms` } : {}) } as CSSProperties}
          />
        </mask>
      ) : null}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray="0.01 14"
        mask={draw ? `url(#${maskId})` : undefined}
      />
    </svg>
  );
}
