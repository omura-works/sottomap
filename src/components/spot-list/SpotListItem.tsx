import Link from "next/link";
import type { StaggerRowProps } from "@/components/ui/useIntroStagger";
import type { Spot } from "@/lib/db/types";
import { walkingLabel } from "@/components/map/geo";
import { Stamp } from "@/components/motion/Stamp";
import { tiltFromId } from "@/components/motion/tilt";
import { PIN_GLYPH } from "@/components/map/pin-halo";

export interface SpotRowLinkProps {
  spot: Spot;
  /** 現在地（または街の中心）からの距離（メートル）。未取得なら undefined。 */
  distanceMeters?: number;
  selected?: boolean;
  /** D1 サイドバー等で「行にカーソルを合わせたら地図側のピンも連動させる」ための任意フック。 */
  onSelect?: (id: string) => void;
  /**
   * D1（PC版トップ）のサイドバー店リストに出る一行説明（SPEC §9.8「D1の店3件の説明」）。
   * 店データ（`spot.reason`）から呼び出し側が渡す。S3 検索結果では渡さず、
   * サムネ＋店名＋メタのみの行にする。
   */
  description?: string;
}

export interface SpotListItemProps extends SpotRowLinkProps {
  /** 初回表示の順次表示（`useIntroStagger`）。 */
  rowMotion?: StaggerRowProps;
}

/**
 * 一覧の行の中身（SPEC motion §5.3「一覧の行」）。行全体が詳細ページ `/[city]/spots/[id]` へのリンク。
 * サムネ（写真が無ければ灯りの点）の右下に、その店の静けさの判子。店名・「海鮮丼 / 北24条 / 徒歩7分」・説明（地図の列だけ）。
 */
export function SpotRowLink({ spot, distanceMeters, selected = false, onSelect, description }: SpotRowLinkProps) {
  const metaParts = [spot.category, spot.areaName, distanceMeters !== undefined ? walkingLabel(distanceMeters) : null].filter(
    (part): part is string => Boolean(part),
  );

  return (
    <Link
      href={`/${spot.citySlug}/spots/${spot.id}`}
      transitionTypes={["page-forward"]}
      onMouseEnter={() => onSelect?.(spot.id)}
      onFocus={() => onSelect?.(spot.id)}
      className="spot-row"
      data-selected={selected ? "true" : "false"}
    >
      <span className="spot-thumb" aria-hidden="true">
        {spot.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- photoUrl は任意ドメインのため next/image のドメイン許可設定を避ける
          <img src={spot.photoUrl} alt="" className="spot-thumb-photo" />
        ) : null}
        <Stamp glyph={PIN_GLYPH[spot.quietness]} tone={spot.quietness} size={26} tilt={tiltFromId(spot.id, 4)} className="spot-thumb-stamp" />
      </span>
      <span className="spot-row-text">
        <span className="spot-row-name">{spot.name}</span>
        {metaParts.length > 0 ? <span className="spot-row-meta">{metaParts.join(" / ")}</span> : null}
        {description ? <span className="spot-row-desc">{description}</span> : null}
      </span>
    </Link>
  );
}

/**
 * S3 検索結果 / D1 サイドバーの店リストの1行（`<li>` 付き）。並べ替えの動きが要る一覧は `SinkingRows` を使う。
 */
export function SpotListItem({ rowMotion, ...props }: SpotListItemProps) {
  return (
    <li className={rowMotion?.className} style={rowMotion?.style}>
      <SpotRowLink {...props} />
    </li>
  );
}
