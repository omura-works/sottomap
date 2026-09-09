"use server";

// S6「確認」回答の Server Action。
// 回答 → verifications へ記録 → resolveQuietness で静けさ再計算 → 次回確認日リセット
// → 灯りポイント/バッジは lantern.ts 経由で算出、という流れ（SPEC §2.3 / §2.5）。

import { revalidatePath } from "next/cache";
import type { Badge, Quietness } from "@/lib/db/types";
import { getSpot, listVerifications } from "@/lib/db/spots";
import { resolveQuietness } from "@/lib/domain/quietness";
import { POINTS_PER_VERIFICATION, resolveBadges, totalPoints } from "@/lib/domain/lantern";
import { applyVerificationResult, createVerificationRecord, getLanternInputForUser } from "@/components/spot-form/db";
import { verifyAnswerSchema } from "@/components/spot-form/verify-schema";
import { DEMO_USER_ID } from "@/components/profile/demo-user";

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
  spotId: string,
  answer: Quietness,
): Promise<SubmitVerificationResult | SubmitVerificationError> {
  const parsed = verifyAnswerSchema.safeParse({ spotId, answer });
  if (!parsed.success) {
    return { ok: false, error: "答えを選んでください" };
  }

  const userId = DEMO_USER_ID; // TODO(Task6): 認証結線後は実ユーザーIDに置き換える

  const spot = await getSpot(spotId);
  if (!spot) {
    return { ok: false, error: "スポットが見つかりませんでした" };
  }

  const now = new Date();

  try {
    await createVerificationRecord(spotId, userId, parsed.data.answer);
    const verifications = await listVerifications(spotId);
    const quietness = resolveQuietness(verifications, spot.quietness);
    await applyVerificationResult(spotId, quietness, now);

    const lanternInput = await getLanternInputForUser(userId);
    const badges = resolveBadges(lanternInput);

    revalidatePath(`/verify/${spotId}`);
    revalidatePath(`/${spot.citySlug}/spots/${spotId}`);

    return {
      ok: true,
      pointsAwarded: POINTS_PER_VERIFICATION,
      totalPoints: totalPoints(lanternInput),
      badges,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "確認の記録に失敗しました" };
  }
}
