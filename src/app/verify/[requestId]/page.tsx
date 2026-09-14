import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { getLatestMissedRequestId, getSpot, getVerificationRequest, listVerifications } from "@/lib/db/spots";
import { answerEligibility, daysSince } from "@/lib/domain/lifecycle";
import { formatTokyoMonthDay } from "@/lib/format/date-time";
import { VerifyForm } from "@/components/spot-form/VerifyForm";
import { Card } from "@/components/ui";

interface VerifyPageProps {
  params: Promise<{ requestId: string }>;
}

/**
 * S6「確認」 `/verify/[requestId]`。requestId は verification_requests.id。
 * Spec §9.13.3: 回答フォームを出すのは回答できる依頼（期限到来済みの open、または dormant 復帰の対象になる
 * 最新の missed）だけ。期限前の依頼は「次の確認は{月日}に届きます。」とだけ表示する。
 */
export default async function VerifyPage({ params }: VerifyPageProps) {
  await connection();
  const { requestId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/verify/${requestId}`)}`);

  const request = await getVerificationRequest(requestId);
  // 依頼は本人宛てのものだけを扱う（Supabase では RLS でも本人の行しか読めない）。
  if (!request || request.userId !== userId) notFound();
  const spot = await getSpot(request.spotId);
  if (!spot) notFound();

  const now = new Date();
  const latestMissedId = request.status === "missed" ? await getLatestMissedRequestId(spot.id) : null;
  const eligibility = answerEligibility(request, spot.status, latestMissedId, now);

  const lastCheckedAt = spot.lastVerifiedAt ?? spot.publishedAt ?? spot.createdAt;
  const daysSinceLast = daysSince(lastCheckedAt, now);

  if (eligibility === "answerable") {
    const verifications = await listVerifications(spot.id);
    const history = [...verifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return (
      <div className="mx-auto max-w-xl px-4 py-8 lg:py-12">
        <VerifyForm requestId={request.id} spotName={spot.name} daysSinceLast={daysSinceLast} history={history} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 lg:py-12 space-y-6">
      <div className="space-y-1">
        <p className="text-muted text-sm">地元の人へ / 90日ごとの確認</p>
        <h2>この店は、まだ隠れていますか</h2>
      </div>
      {eligibility === "not-due" ? (
        <Card title={spot.name} meta={`前回の確認から${daysSinceLast}日`}>
          <p className="m-0">次の確認は{formatTokyoMonthDay(request.dueAt)}に届きます。</p>
        </Card>
      ) : (
        <Card
          kicker={request.status === "answered" ? "回答済み" : undefined}
          title={spot.name}
          meta={`前回の確認から${daysSinceLast}日`}
        />
      )}
    </div>
  );
}
