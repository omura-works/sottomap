import { notFound } from "next/navigation";
import { getSpot, listVerifications } from "@/lib/db/spots";
import { daysSince } from "@/lib/domain/lifecycle";
import { VerifyForm } from "@/components/spot-form/VerifyForm";

interface VerifyPageProps {
  params: Promise<{ requestId: string }>;
}

/**
 * S6「確認」 `/verify/[requestId]`（SPEC §4 S6）。
 *
 * `verification_request` を独立して永続化するテーブルは docs/SPEC.md §3 の
 * データモデルに存在しないため、`requestId` は対象スポットの `id` として扱う
 * （＝確認依頼＝次回確認日を迎えた公開スポットそのもの、という設計）。
 */
export default async function VerifyPage({ params }: VerifyPageProps) {
  const { requestId } = await params;

  const spot = await getSpot(requestId);
  if (!spot) notFound();

  const verifications = await listVerifications(spot.id);
  const history = [...verifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const lastCheckedAt = spot.lastVerifiedAt ?? spot.publishedAt ?? spot.createdAt;
  const daysSinceLast = daysSince(lastCheckedAt, new Date());

  return (
    <div className="mx-auto max-w-xl px-4 py-8 lg:py-12">
      <VerifyForm spotId={spot.id} spotName={spot.name} daysSinceLast={daysSinceLast} history={history} />
    </div>
  );
}
