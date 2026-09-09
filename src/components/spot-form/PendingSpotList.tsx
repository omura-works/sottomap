import type { Spot } from "@/lib/db/types";
import { Card } from "@/components/ui";
import { ENDORSEMENTS_REQUIRED } from "@/lib/domain/lifecycle";
import { EndorseButton } from "./EndorseButton";

export interface PendingSpotListProps {
  spots: Spot[];
  citySlug: string;
  viewerId: string;
}

/**
 * 承認待ち一覧（Server Component）。
 *
 * 導線について: 現時点でこのコンポーネントを開くルートは
 * `/[city]/spots/new`（このタスクの所有ページ）の下部のみ。
 * SPEC上は S2 地図のヘッダー付近や S7 プロフィールの「確認待ち」からも
 * 開けるのが自然だが、そのルートは Task 3 / Task 5 の所有領域のため、
 * ここでは実装せず報告に導線追加を依頼する。
 */
export function PendingSpotList({ spots, citySlug, viewerId }: PendingSpotListProps) {
  if (spots.length === 0) {
    return (
      <Card kicker="承認待ち" title="いま、承認待ちのピンはありません">
        この街で新しく立てられたピンがあれば、ここに表示されます。
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <h3>承認待ちのピン</h3>
      {spots.map((spot) => {
        const isOwn = spot.authorId === viewerId;
        return (
          <Card
            key={spot.id}
            kicker={spot.areaName ?? undefined}
            title={spot.name}
            meta={`承認 ${spot.endorsementCount}/${ENDORSEMENTS_REQUIRED}`}
          >
            <p>{spot.reason}</p>
            {isOwn ? (
              <p className="text-muted text-sm">自分の投稿には承認できません。</p>
            ) : (
              <EndorseButton spotId={spot.id} citySlug={citySlug} initialCount={spot.endorsementCount} />
            )}
          </Card>
        );
      })}
    </div>
  );
}
