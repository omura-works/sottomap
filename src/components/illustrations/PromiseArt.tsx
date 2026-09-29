// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden・focusable="false"。
import type { CSSProperties } from "react";

export type PromiseArtKind = "pin" | "faces" | "calendar";

export interface PromiseArtProps {
  kind: PromiseArtKind;
  /** 一辺（px、既定 64）。 */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * やくそくの挿絵3つ（SPEC motion §5.1。見本 `Main.dc.html` の値）。
 * 動かす部分に印のクラスを付けてある: ピン `.promise-art-pin`（押す）・2人の顔 `.promise-art-faces`（うなずく）・
 * カレンダーの橙の点 `.promise-art-dot`（押す）。
 */
export function PromiseArt({ kind, size = 64, className, style }: PromiseArtProps) {
  return (
    <svg
      className={["promise-art", `promise-art-${kind}-art`, className].filter(Boolean).join(" ")}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      overflow="visible"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "pin" ? (
        <>
          <circle cx={32} cy={32} r={30} fill="var(--color-accent-100)" />
          <g className="promise-art-pin">
            <path
              d="M32 14c-7 0-12 5-12 11.5C20 34 32 48 32 48s12-14 12-22.5C44 19 39 14 32 14z"
              fill="var(--color-accent-400)"
              stroke="var(--color-accent-700)"
              strokeWidth={2}
            />
            <circle cx={32} cy={26} r={4} fill="var(--color-accent-100)" />
          </g>
        </>
      ) : null}
      {kind === "faces" ? (
        <>
          <circle cx={32} cy={32} r={30} fill="var(--color-accent-2-100)" />
          <g className="promise-art-faces">
            <circle cx={24} cy={26} r={6} fill="var(--color-accent-2-400)" stroke="var(--color-accent-2-800)" strokeWidth={2} />
            <circle cx={40} cy={26} r={6} fill="var(--color-accent-2-400)" stroke="var(--color-accent-2-800)" strokeWidth={2} />
            <path
              d="M14 46c2-7 6-10 10-10s8 3 10 10M30 46c2-7 6-10 10-10s8 3 10 10"
              fill="none"
              stroke="var(--color-accent-2-800)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </g>
        </>
      ) : null}
      {kind === "calendar" ? (
        <>
          <circle cx={32} cy={32} r={30} fill="var(--color-neutral-800)" />
          <rect x={18} y={20} width={28} height={26} rx={5} fill="none" stroke="var(--color-accent-300)" strokeWidth={2} />
          <path d="M18 28h28M25 16v8M39 16v8" stroke="var(--color-accent-300)" strokeWidth={2} strokeLinecap="round" />
          <circle className="promise-art-dot" cx={32} cy={37} r={3} fill="var(--color-accent-400)" />
        </>
      ) : null}
    </svg>
  );
}
