import type { Spot } from "@/lib/db/types";
import { Card } from "@/components/ui/Card";
import { LanternChild } from "@/components/illustrations/LanternChild";
import { EndorseButton } from "./EndorseButton";
import { EndorseMeter } from "./EndorseMeter";

export interface PendingSpotListProps {
  spots: Spot[];
  citySlug: string;
  viewerId: string;
}

/**
 * 承認待ち一覧（Server Component。SPEC motion §5.8-3）。
 *
 * 導線について: 現時点でこのコンポーネントを開くルートは
 * `/[city]/spots/new`（このタスクの所有ページ）の下部のみ。
 * SPEC上は S2 地図のヘッダー付近や S7 プロフィールの「確認待ち」からも
 * 開けるのが自然だが、そのルートは Task 3 / Task 5 の所有領域のため、
 * ここでは実装せず報告に導線追加を依頼する。
 */
export function PendingSpotList({ spots, citySlug, viewerId }: PendingSpotListProps) {
  if (spots.length === 0) {
    // §4.6: カードの左上に灯りの子。title をひと言、本文を説明に
    return (
      <Card kicker="承認待ち" title="いま、承認待ちのピンはありません" className="pending-empty">
        <LanternChild size={36} className="pending-empty-child" />
        この街で新しいピンが立ったら、ここに出てきます。
      </Card>
    );
  }

  return (
    <section className="pending-spots" aria-labelledby="pending-spots-heading">
      <h2 id="pending-spots-heading" className="pending-spots-title">
        承認待ちのピン
      </h2>
      <p className="pending-spots-lead">同じ街の人が立てたピンです。行ったことがあれば、教えてください。</p>
      <div className="pending-spots-list">
        {spots.map((spot) => {
          const isOwn = spot.authorId === viewerId;
          return (
            <Card key={spot.id} kicker={spot.areaName ?? undefined} title={spot.name} className="relative pending-spot">
              <p className="m-0">{spot.reason}</p>
              {isOwn ? (
                <>
                  <EndorseMeter count={spot.endorsementCount} />
                  <p className="text-muted text-sm m-0">自分で立てたピンには、承認できません。</p>
                </>
              ) : (
                <EndorseButton spotId={spot.id} citySlug={citySlug} initialCount={spot.endorsementCount} />
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
