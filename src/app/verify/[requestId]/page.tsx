import { notFound } from "next/navigation";
import { getSpot, getVerificationRequest, listVerifications } from "@/lib/db/spots";
import { daysSince } from "@/lib/domain/lifecycle";
import { VerifyForm } from "@/components/spot-form/VerifyForm";
import { Card } from "@/components/ui";

interface VerifyPageProps {
  params: Promise<{ requestId: string }>;
}

/** S6「確認」 `/verify/[requestId]`。requestId は verification_requests.id。 */
export default async function VerifyPage({ params }: VerifyPageProps) {
  const { requestId } = await params;

  const request = await getVerificationRequest(requestId);
  if (!request) notFound();
  const spot = await getSpot(request.spotId);
  if (!spot) notFound();

  const verifications = await listVerifications(spot.id);
  const history = [...verifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const lastCheckedAt = spot.lastVerifiedAt ?? spot.publishedAt ?? spot.createdAt;
  const daysSinceLast = daysSince(lastCheckedAt, new Date());

  if (request.status !== "open") {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 lg:py-12 space-y-6">
        <div className="space-y-1">
          <p className="text-muted text-sm">地元の人へ / 90日ごとの確認</p>
          <h2>この店は、まだ隠れていますか</h2>
        </div>
        <Card kicker="回答済み" title={spot.name} meta={`前回の確認から${daysSinceLast}日`} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 lg:py-12">
      <VerifyForm requestId={request.id} spotName={spot.name} daysSinceLast={daysSinceLast} history={history} />
    </div>
  );
}
