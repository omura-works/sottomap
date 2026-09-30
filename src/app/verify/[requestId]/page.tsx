import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { getLatestMissedRequestId, getSpot, getVerificationRequest, listVerifications } from "@/lib/db/spots";
import { answerEligibility, daysSince } from "@/lib/domain/lifecycle";
import { formatTokyoMonthDay } from "@/lib/format/date-time";
import { VerifyForm } from "@/components/spot-form/VerifyForm";
import { PageTransition } from "@/components/motion/PageTransition";
import { VerifyHeading, VerifyShopCard } from "@/components/spot-form/VerifyIntro";

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
      <PageTransition>
        <div className="mx-auto max-w-xl px-4 py-8 lg:py-12">
          <VerifyForm
            requestId={request.id}
            spotName={spot.name}
            daysSinceLast={daysSinceLast}
            history={history}
            wasDormant={spot.status === "dormant"}
          />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="verify mx-auto max-w-xl px-4 py-8 lg:py-12">
        <VerifyHeading />
        {eligibility === "not-due" ? (
          <VerifyShopCard spotName={spot.name} daysSinceLast={daysSinceLast}>
            <p className="verify-shop-note">次の確認は{formatTokyoMonthDay(request.dueAt)}に届きます。</p>
            <p className="verify-shop-note">そのときに、またよろしくお願いします。</p>
          </VerifyShopCard>
        ) : (
          <VerifyShopCard
            spotName={spot.name}
            daysSinceLast={daysSinceLast}
            kicker={request.status === "answered" ? "回答済み" : undefined}
          />
        )}
      </div>
    </PageTransition>
  );
}
