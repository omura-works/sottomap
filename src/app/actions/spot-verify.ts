"use server";

// S6「確認」回答の Server Action。
// verification_requests.id を answerVerification() に渡し、回答と次回依頼を一括反映する。

import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import type { Badge, Quietness } from "@/lib/db/types";
import {
  getProfileStats,
  getUserProfile,
  listSpotsByAuthor,
} from "@/lib/db/spots";
import { answerVerification } from "@/lib/db/mutations";
import { resolveBadges } from "@/lib/domain/lantern";
import { verifyAnswerSchema } from "@/components/spot-form/verify-schema";

export interface SubmitVerificationResult {
  ok: true;
  pointsAwarded: number;
  totalPoints: number;
  badges: Badge[];
}

export interface SubmitVerificationError {
  ok: false;
  error: string;
}

export async function submitVerification(
  requestId: string,
  answer: Quietness,
): Promise<SubmitVerificationResult | SubmitVerificationError> {
  const parsed = verifyAnswerSchema.safeParse({ requestId, answer });
  if (!parsed.success) {
    return { ok: false, error: "答えを選んでください" };
  }

  const userId = await getCurrentUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/verify/${requestId}`)}`);

  try {
    const result = await answerVerification(parsed.data.requestId, userId, parsed.data.answer);
    const [profile, stats, authoredSpots] = await Promise.all([
      getUserProfile(userId),
      getProfileStats(userId),
      listSpotsByAuthor(userId),
    ]);
    const badges = resolveBadges({
      verificationCount: stats.verificationsAnswered,
      winterVerificationCount: stats.winterVerificationCount,
      publishedPortSpotCount: stats.publishedPortSpotCount,
      publishedSpotCount: authoredSpots.filter((spot) => spot.status === "published").length,
    });
    // この画面は回答直後に「+5」を見せる。revalidatePath は現在のルートも
    // 同じ応答内で再描画して回答済み画面へ差し替えるため、動的ページの次回読みに任せる。

    return {
      ok: true,
      pointsAwarded: result.pointsAwarded,
      totalPoints: profile?.lanternPoints ?? result.pointsAwarded,
      badges,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "確認の記録に失敗しました" };
  }
}
