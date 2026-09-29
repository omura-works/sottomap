// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden。
import { RoadLines } from "@/components/illustrations/RoadLines";

export interface MapUnderlayProps {
  /** 大通りの線を 60ms ずらしで描く（地図のロード中だけ）。本物の地図の画面では描かない（止まった絵）。 */
  draw?: boolean;
  className?: string;
}

/** 街区の通り（見本 `mapPaper` の格子。3本に1本・4本に1本を太い通りにする）。 */
const VERTICAL = Array.from({ length: 15 }, (_, k) => k - 2).map((i) => ({ x: i * 95, w: i % 3 === 0 ? 16 : 7 }));
const HORIZONTAL = Array.from({ length: 15 }, (_, k) => k - 2).map((j) => ({ y: j * 92, w: ((j % 4) + 4) % 4 === 1 ? 16 : 7 }));
const RIVER = "M1040 -40 C 900 180, 980 360, 820 520 S 700 900, 760 1060";

function Streets({ extra }: { extra: number }) {
  return (
    <>
      {VERTICAL.map((line) => (
        <line key={`v${line.x}`} x1={line.x} y1={-300} x2={line.x} y2={1300} strokeWidth={line.w + extra} />
      ))}
      {HORIZONTAL.map((line) => (
        <line key={`h${line.y}`} x1={-300} y1={line.y} x2={1300} y2={line.y} strokeWidth={line.w + extra} />
      ))}
    </>
  );
}

/**
 * 紙の地図（SPEC motion §4.5）。街区の通り・公園・川・線路の、止まった「地図と読める」絵（見本 `mapPaper`）。
 * 地図のロード中は画面いっぱいに描き（大通りの線が描かれる）、本物の地図の画面でも MapLibre の地図の div の**下**に敷く
 * （タイルが来るまでの間も意図した絵に見える。地図の上には何も重ねない）。
 * アイリス（/start → 地図）の円の中に見えるのはこの絵（円が開く 640ms の間に地図らしく見えるように）。
 */
export function MapUnderlay({ draw = false, className }: MapUnderlayProps) {
  return (
    <div className={["map-underlay", className].filter(Boolean).join(" ")} aria-hidden="true">
      <svg className="map-underlay-paper" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" focusable="false">
        <rect width={1000} height={1000} fill="var(--color-neutral-200)" />
        <g transform="rotate(-9 500 500)">
          {/* 公園の帯と、角の公園 */}
          <rect x={-200} y={268} width={1400} height={46} fill="var(--color-accent-2-200)" />
          <g stroke="var(--color-neutral-300)" strokeLinecap="square">
            <Streets extra={4} />
          </g>
          <g stroke="var(--color-neutral-100)" strokeLinecap="square">
            <Streets extra={0} />
          </g>
          <rect x={330} y={600} width={170} height={120} rx={18} fill="var(--color-accent-2-200)" />
        </g>
        {/* 川 */}
        <path d={RIVER} fill="none" stroke="var(--color-neutral-300)" strokeWidth={58} />
        <path d={RIVER} fill="none" stroke="var(--color-accent-2-100)" strokeWidth={50} />
        {/* 線路 */}
        <path
          d="M-40 760 C 200 700, 420 640, 1040 420"
          fill="none"
          stroke="var(--color-neutral-500)"
          strokeWidth={4}
          strokeDasharray="14 10"
          opacity={0.7}
        />
      </svg>
      {/* 大通り（ロード中は描かれる） */}
      <RoadLines tone="paper" draw={draw} />
    </div>
  );
}
