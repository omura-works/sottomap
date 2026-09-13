"use server";

// 承認（endorsement）「行ったことがある」の Server Action。
// 同じ街のユーザーへの表示制御は listPendingSpots（Task 2）側の責務、
// ここでは「自分の投稿には出さない／押せない」の最終防御のみ行う。

import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import type { SpotStatus } from "@/lib/db/types";
import { endorseSpot as persistEndorsement } from "@/lib/db/mutations";
import { getSpot } from "@/lib/db/spots";

export interface EndorseResult {
  status: SpotStatus;
  endorsementCount: number;
}

export async function endorseSpot(spotId: string, citySlug: string): Promise<EndorseResult> {
  const userId = await getCurrentUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/${citySlug}/spots/new`)}`);

  const spot = await getSpot(spotId);
  if (!spot) {
    throw new Error("スポットが見つかりませんでした");
  }
  if (spot.authorId === userId) {
    throw new Error("自分の投稿には「行ったことがある」を押せません");
  }
  if (spot.status !== "pending") {
    return { status: spot.status, endorsementCount: spot.endorsementCount };
  }

  await persistEndorsement(spotId, userId);
  const updated = await getSpot(spotId);
  if (!updated) throw new Error("更新したスポットが見つかりませんでした");

  return { status: updated.status, endorsementCount: updated.endorsementCount };
}
