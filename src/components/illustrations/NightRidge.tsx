// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden。
import type { CSSProperties } from "react";

export interface NightRidgeProps {
  className?: string;
  style?: CSSProperties;
}

/** 夜の山並み（奥 neutral-800 の 70%・手前 neutral-900）。幅いっぱいに伸びる。 */
export function NightRidge({ className, style }: NightRidgeProps) {
  return (
    <svg
      className={["night-ridge", className].filter(Boolean).join(" ")}
      style={style}
      viewBox="0 0 1200 120"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0 120 L0 70 C 120 40, 220 60, 320 48 C 430 34, 520 64, 640 52 C 760 40, 860 20, 980 44 C 1060 58, 1130 50, 1200 40 L1200 120 Z"
        fill="var(--color-neutral-800)"
        opacity={0.7}
      />
      <path
        d="M0 120 L0 92 C 140 70, 260 96, 400 80 C 540 64, 640 90, 780 84 C 900 78, 1020 60, 1200 76 L1200 120 Z"
        fill="var(--color-neutral-900)"
      />
    </svg>
  );
}
