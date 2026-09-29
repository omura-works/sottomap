// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden・focusable="false"。
import type { CSSProperties, ReactNode } from "react";
import { NOREN_CLOTH_X, norenClothPath } from "./Noren";
import { useSvgId } from "./svg-id";

export interface NightAlleyProps {
  className?: string;
  style?: CSSProperties;
  /** 窓の灯りが1つずつ灯る入場を付ける（遅れ 120ms から 60ms ずらし）。 */
  ignite?: boolean;
  /** 路地の上に重ねる物（「写真は、まだありません」の字など）。 */
  children?: ReactNode;
}

const WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [36, 150],
  [334, 140],
  [350, 190],
];

/**
 * 夜の路地（SPEC motion §2.10。写真の無い店の詳細で使う）。地は夜の地平線、左右の建物のかげ、
 * 窓の灯り3つ（光は drop-shadow を使わず同じ位置の radialGradient の円）、中央の戸口に暖簾。
 */
export function NightAlley({ className, style, ignite = false, children }: NightAlleyProps) {
  const glowId = useSvgId("alley");
  return (
    <div className={["night-alley", className].filter(Boolean).join(" ")} style={style}>
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={glowId}>
            <stop offset="0" stopColor="var(--color-accent-400)" stopOpacity={0.55} />
            <stop offset="1" stopColor="var(--color-accent-400)" stopOpacity={0} />
          </radialGradient>
        </defs>
        <g stroke="var(--color-neutral-100)" strokeOpacity={0.1} fill="none">
          <path d="M140 300 L190 160" />
          <path d="M260 300 L210 160" />
          <path d="M0 250 C 120 230, 280 230, 400 250" />
        </g>
        <path d="M0 300 L0 120 L90 110 L100 300 Z" fill="var(--color-neutral-800)" />
        <path d="M300 300 L310 96 L400 104 L400 300 Z" fill="var(--color-neutral-800)" />
        {WINDOWS.map(([x, y], i) => {
          const delay = { "--d": `${120 + i * 60}ms` } as CSSProperties;
          return (
            <g key={x}>
              <circle
                className={ignite ? "alley-window verb-ignite-glow" : "alley-window"}
                style={delay}
                cx={x + 7}
                cy={y + 9}
                r={18}
                fill={`url(#${glowId})`}
              />
              <rect
                className={ignite ? "alley-window verb-ignite" : "alley-window"}
                style={delay}
                x={x}
                y={y}
                width={14}
                height={18}
                rx={2}
                fill="var(--color-accent-400)"
              />
            </g>
          );
        })}
        <g transform="translate(152 150) scale(0.6)">
          <rect x={4} y={2} width={152} height={6} rx={3} fill="var(--color-neutral-800)" />
          {NOREN_CLOTH_X.map((x) => (
            <path key={x} className="noren-cloth" d={norenClothPath(x)} fill="var(--color-accent-2-700)" />
          ))}
        </g>
        <rect x={160} y={196} width={80} height={104} fill="color-mix(in srgb, var(--color-accent-400) 18%, transparent)" />
      </svg>
      {children}
    </div>
  );
}
