// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden・focusable="false"。
import type { CSSProperties } from "react";

export type HandLineVariant = "underline" | "circle" | "check" | "hanamaru";

export interface HandLineProps {
  variant: HandLineVariant;
  className?: string;
  style?: CSSProperties;
  /** 線の太さ。既定は underline 5・circle 2.5・check 2・hanamaru 3。 */
  strokeWidth?: number;
  /** 線の色（CSS の色）。既定 currentColor。 */
  color?: string;
  /** 線を「描く」入場を付ける（`.verb-draw`）。 */
  draw?: boolean;
  /** 描き始めの遅れ（ミリ秒）。 */
  delay?: number;
}

const SHAPES: Record<
  Exclude<HandLineVariant, "hanamaru">,
  { viewBox: string; d: string; stretch: boolean; width: number; fixedStroke: boolean }
> = {
  underline: { viewBox: "0 0 190 18", d: "M4 12 C 50 4, 120 4, 186 10", stretch: true, width: 5, fixedStroke: false },
  circle: {
    viewBox: "0 0 120 48",
    d: "M62 5 C 30 3, 6 12, 6 25 C 6 39, 34 45, 62 44 C 92 43, 115 36, 114 23 C 113 10, 88 4, 58 6 C 44 7, 32 10, 24 14",
    stretch: true,
    width: 2.5,
    // 字の大きさに合わせて縦横が別々に縮むので、線の太さ（選択の目印として 3:1 が要る）を画面の px で保つ。
    fixedStroke: true,
  },
  check: { viewBox: "0 0 12 12", d: "M2 6.5 L5 9 L10 3", stretch: false, width: 2, fixedStroke: false },
};

const HANAMARU_PETALS =
  "M48 18 A17 17 0 0 1 76.5 38.7 A17 17 0 0 1 65.6 72.3 A17 17 0 0 1 30.4 72.3 A17 17 0 0 1 19.5 38.7 A17 17 0 0 1 48 18";
const HANAMARU_SPIRAL = "M48 50 c -4 -2 -2 -8 3 -8 c 7 0 9 9 3 13 c -8 5 -18 -2 -16 -11 c 2 -12 17 -16 26 -9 c 10 8 8 24 -4 30";

function drawStyle(delay: number, duration?: number): CSSProperties {
  return { "--d": `${delay}ms`, ...(duration ? { "--dur-draw": `${duration}ms` } : {}) } as CSSProperties;
}

/**
 * 手描きの線（SPEC motion §2.10）: 下線・丸囲み・チェック・花丸。`pathLength="1"` なので、
 * 線の長さに関係なく `stroke-dashoffset` 1→0 で「描く」。
 * 花丸は、うずまき（360ms）→ 花びら（580ms）の順に描く（合わせて 900ms）。
 */
export function HandLine({ variant, className, style, strokeWidth, color = "currentColor", draw = false, delay = 0 }: HandLineProps) {
  const classes = ["hand-line", `hand-line-${variant}`, className].filter(Boolean).join(" ");
  const common = {
    fill: "none",
    stroke: color,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    pathLength: 1,
  };

  if (variant === "hanamaru") {
    return (
      <svg className={classes} style={style} viewBox="0 0 96 96" aria-hidden="true" focusable="false">
        <path
          {...common}
          d={HANAMARU_SPIRAL}
          strokeWidth={strokeWidth ?? 3}
          className={draw ? "verb-draw" : undefined}
          style={draw ? drawStyle(delay, 360) : undefined}
        />
        <path
          {...common}
          d={HANAMARU_PETALS}
          strokeWidth={strokeWidth ?? 3}
          className={draw ? "verb-draw" : undefined}
          style={draw ? drawStyle(delay + 320, 580) : undefined}
        />
      </svg>
    );
  }

  const shape = SHAPES[variant];
  return (
    <svg
      className={classes}
      style={style}
      viewBox={shape.viewBox}
      preserveAspectRatio={shape.stretch ? "none" : undefined}
      aria-hidden="true"
      focusable="false"
    >
      <path
        {...common}
        d={shape.d}
        strokeWidth={strokeWidth ?? shape.width}
        vectorEffect={shape.fixedStroke ? "non-scaling-stroke" : undefined}
        className={draw ? "verb-draw" : undefined}
        style={draw ? drawStyle(delay) : undefined}
      />
    </svg>
  );
}
