// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden。
import type { CSSProperties } from "react";

export interface NightRidgeProps {
  className?: string;
  style?: CSSProperties;
  /**
   * 山並みの後ろの地の色（奥の山は neutral-800 の 70% をこの色に混ぜた不透明の色で塗る）。
   * 既定は紙（bg）。夜の面の中に置くときは neutral-900。半透明にしないのは、後ろの物（遷移中の古いページなど）が透けないため。
   */
  backdrop?: string;
}

/** 夜の山並み（奥 neutral-800 の 70% を地に混ぜた色・手前 neutral-900）。幅いっぱいに伸びる。 */
export function NightRidge({ className, style, backdrop = "var(--color-bg)" }: NightRidgeProps) {
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
        fill={`color-mix(in srgb, var(--color-neutral-800) 70%, ${backdrop})`}
      />
      <path
        d="M0 120 L0 92 C 140 70, 260 96, 400 80 C 540 64, 640 90, 780 84 C 900 78, 1020 60, 1200 76 L1200 120 Z"
        fill="var(--color-neutral-900)"
      />
    </svg>
  );
}
