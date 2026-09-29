// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden・focusable="false"。
import type { CSSProperties } from "react";

/** 今の /start の夜の道の線（viewBox 0 0 1200 720・6本）。値はそのまま（SPEC motion §2.10）。 */
const ROADS: ReadonlyArray<{ d: string; width: number; opacity: number }> = [
  { d: "M-40 560 L420 260 L760 150 L1260 -40", width: 1.2, opacity: 0.14 },
  { d: "M-60 330 L300 470 L620 520 L1260 760", width: 1, opacity: 0.1 },
  { d: "M180 -40 L360 300 L470 760", width: 1, opacity: 0.09 },
  { d: "M700 -40 L820 260 L1000 420 L1260 470", width: 1, opacity: 0.1 },
  { d: "M560 760 L780 470 L1040 300 L1260 250", width: 0.8, opacity: 0.08 },
  { d: "M-40 120 C 180 160, 300 90, 520 130 S 860 60, 1260 110", width: 0.8, opacity: 0.07 },
];

/** 紙の地図（MapUnderlay）の大通りの不透明度（地図と読めるよう、はっきりめ）。 */
const PAPER_OPACITY = [0.95, 0.85, 0.8, 0.85, 0.75, 0.75] as const;

export interface RoadLinesProps {
  className?: string;
  style?: CSSProperties;
  /** "night": 夜の面の上の生成りの細い線（今の /start）。"paper": 紙の上の neutral-400 の線（紙の地図）。 */
  tone?: "night" | "paper";
  /** 線を1本ずつ描く（60ms ずらし）。紙の地図のロード中だけで使う。 */
  draw?: boolean;
}

export function RoadLines({ className, style, tone = "night", draw = false }: RoadLinesProps) {
  const paper = tone === "paper";
  return (
    <svg
      className={["road-lines", className].filter(Boolean).join(" ")}
      style={style}
      viewBox="0 0 1200 720"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke={paper ? "var(--color-neutral-400)" : "var(--color-neutral-100)"}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      {ROADS.map((road, i) => (
        <path
          key={road.d}
          d={road.d}
          pathLength={draw ? 1 : undefined}
          className={draw ? "verb-draw" : undefined}
          style={draw ? ({ "--d": `${i * 60}ms`, "--dur-draw": "1200ms" } as CSSProperties) : undefined}
          strokeWidth={paper ? 3 : road.width}
          strokeOpacity={paper ? PAPER_OPACITY[i] : road.opacity}
          vectorEffect={paper ? "non-scaling-stroke" : undefined}
        />
      ))}
    </svg>
  );
}
