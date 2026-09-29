// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden。
import { RoadLines } from "@/components/illustrations/RoadLines";

export interface MapUnderlayProps {
  /** 道の線を 60ms ずらしで描く（地図のロード中だけ）。本物の地図の画面では描かない（止まった絵）。 */
  draw?: boolean;
  className?: string;
}

/**
 * 紙の地図（SPEC motion §4.5）。生成りの地に neutral-400 の細い道の線。
 * 地図のロード中は画面いっぱいに描き、本物の地図の画面でも MapLibre の地図の div の**下**に敷く
 * （タイルが来るまでの間も意図した絵に見える。地図の上には何も重ねない）。
 */
export function MapUnderlay({ draw = false, className }: MapUnderlayProps) {
  return (
    <div className={["map-underlay", className].filter(Boolean).join(" ")} aria-hidden="true">
      <RoadLines tone="paper" draw={draw} />
    </div>
  );
}
