import Link from "next/link";
import type { Spot } from "@/lib/db/types";
import { walkingLabel } from "@/components/map/geo";

export interface SpotListItemProps {
  spot: Spot;
  /** 現在地（または街の中心）からの距離（メートル）。未取得なら undefined。 */
  distanceMeters?: number;
  selected?: boolean;
  /** D1 サイドバー等で「行にカーソルを合わせたら地図側のピンも連動させる」ための任意フック。 */
  onSelect?: (id: string) => void;
  /**
   * D1（PC版トップ）のサイドバー店リストに出る一行説明（SPEC §9.8「D1の店3件の説明」）。
   * 店データ（`spot.reason`）から呼び出し側が渡す。S3 検索結果では渡さず、
   * 従来どおりサムネ＋店名＋メタのみのシンプルな行のままにする。
   */
  description?: string;
}

/**
 * S3 検索結果 / D1 サイドバーの店リスト行。
 * サムネ＋店名＋「海鮮丼 / 北24条 / 徒歩7分」（SPEC §4 S3）。
 * 行全体が詳細ページ `/[city]/spots/[id]` へのリンク（T5 所有ルート）。
 */
export function SpotListItem({ spot, distanceMeters, selected = false, onSelect, description }: SpotListItemProps) {
  const metaParts = [spot.category, spot.areaName, distanceMeters !== undefined ? walkingLabel(distanceMeters) : null].filter(
    (part): part is string => Boolean(part),
  );

  return (
    <li>
      <Link
        href={`/${spot.citySlug}/spots/${spot.id}`}
        onMouseEnter={() => onSelect?.(spot.id)}
        onFocus={() => onSelect?.(spot.id)}
        className="w-full flex items-center gap-3 rounded-md p-2 no-underline"
        style={{
          background: selected ? "var(--color-accent-100)" : "transparent",
          border: "1px solid",
          borderColor: selected ? "var(--color-accent-600)" : "transparent",
          color: "var(--color-text)",
          textDecoration: "none",
        }}
      >
        <span
          className="shrink-0 overflow-hidden"
          style={{ width: 52, height: 52, borderRadius: "var(--radius-sm)", background: "var(--color-neutral-300)" }}
          aria-hidden
        >
          {spot.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- photoUrl は任意ドメインのため next/image のドメイン許可設定を避ける
            <img src={spot.photoUrl} alt="" className="w-full h-full object-cover" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate" style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 14 }}>
            {spot.name}
          </span>
          <span className="block truncate text-xs text-muted">{metaParts.join(" / ")}</span>
          {description ? (
            <span className="block text-xs text-muted line-clamp-2 mt-0.5">{description}</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
