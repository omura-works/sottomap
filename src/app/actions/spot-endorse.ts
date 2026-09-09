"use server";

// 承認（endorsement）「行ったことがある」の Server Action。
// 同じ街のユーザーへの表示制御は listPendingSpots（Task 2）側の責務、
// ここでは「自分の投稿には出さない／押せない」の最終防御のみ行う。

import { revalidatePath } from "next/cache";
import type { SpotStatus } from "@/lib/db/types";
import { getSpot } from "@/lib/db/spots";
import { nextStatus } from "@/lib/domain/lifecycle";
import { createEndorsement, hasEndorsed, updateSpotStatus } from "@/components/spot-form/db";
import { DEMO_USER_ID } from "@/components/profile/demo-user";

export interface EndorseResult {
  status: SpotStatus;
  endorsementCount: number;
}

export async function endorseSpot(spotId: string, citySlug: string): Promise<EndorseResult> {
  const userId = DEMO_USER_ID; // TODO(Task6): 認証結線後は実ユーザーIDに置き換える

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

  const already = await hasEndorsed(spotId, userId);
  if (!already) {
    await createEndorsement(spotId, userId);
  }

  const endorsementCount = already ? spot.endorsementCount : spot.endorsementCount + 1;
  const now = new Date();
  const status = nextStatus(
    { status: spot.status, createdAt: spot.createdAt, nextVerificationAt: spot.nextVerificationAt },
    endorsementCount,
    now,
  );

  if (status !== spot.status) {
    await updateSpotStatus(spotId, status, now);
  }

  revalidatePath(`/${citySlug}/spots/new`);

  return { status, endorsementCount };
}
