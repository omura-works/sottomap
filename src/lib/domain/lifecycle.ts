// ピンのライフサイクル（Spec §2.2, §2.3）
//
// draft ──投稿──> pending ──同じ街の2人が「行ったことがある」──> published
//                    │                                              │
//                    └──30日間承認が集まらない──> expired            │
//                                                                   │
//                         published ──90日ごとに投稿者へ確認依頼──────┤
//                                                                   │
//                      確認に答えない まま 90日経過 ──> dormant（地図から外れる）

import type { Spot, SpotStatus } from "../db/types";

export const ENDORSEMENTS_REQUIRED = 2;
export const VERIFICATION_INTERVAL_DAYS = 90;
export const DORMANT_AFTER_DAYS = 180; // 期限からさらに90日（= 90 + 90）
export const PENDING_EXPIRY_DAYS = 30;

/** pending のスポットが公開条件を満たしたか（投稿者自身の承認は除外済みの数を渡す） */
export function canPublish(endorsementCount: number): boolean {
  return endorsementCount >= ENDORSEMENTS_REQUIRED;
}

/** '前回の確認から92日' の 92 を出す */
export function daysSince(from: string | Date, now: Date): number {
  const fromDate = typeof from === "string" ? new Date(from) : from;
  const diffMs = now.getTime() - fromDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** 確認に答えた/公開された時点からの次回確認日 */
export function nextVerificationDate(from: Date): Date {
  const next = new Date(from);
  next.setDate(next.getDate() + VERIFICATION_INTERVAL_DAYS);
  return next;
}

/** 次に取るべき状態。変化不要なら現在の status をそのまま返す。 */
export function nextStatus(
  spot: Pick<Spot, "status" | "createdAt" | "nextVerificationAt">,
  endorsementCount: number,
  now: Date,
): SpotStatus {
  if (spot.status === "pending") {
    if (canPublish(endorsementCount)) {
      return "published";
    }
    if (daysSince(spot.createdAt, now) > PENDING_EXPIRY_DAYS) {
      return "expired";
    }
    return "pending";
  }

  if (spot.status === "published") {
    if (
      spot.nextVerificationAt &&
      daysSince(spot.nextVerificationAt, now) >= VERIFICATION_INTERVAL_DAYS
    ) {
      return "dormant";
    }
    return "published";
  }

  // dormant / expired は確認回答など別経路の操作でのみ状態が変わる。
  return spot.status;
}
