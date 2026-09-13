// ピンのライフサイクル（Spec §2.2 / §9.3・9.4・9.7、docs/CONTRACT.md 追補 2026-09-09）
//
// draft ──投稿──> pending ──同じ街の2人が「行ったことがある」──> published
//                    │                                              │
//                    └──30日間承認が集まらない──> expired            │
//                                                                   │
//                         published ──90日ごとに投稿者へ確認依頼(verification_request)──┤
//                                                                   │
//                      due_at からさらに90日無回答(missed) ──> dormant（地図から外れる）
//
// dormant ──投稿者が確認に答える──> published（statusAfterAnswer が担う。日時だけでは判定できない）

import type { Spot, SpotStatus, VerificationRequest } from "../db/types";

export const ENDORSEMENTS_REQUIRED = 2;
export const VERIFICATION_INTERVAL_DAYS = 90;
/** due_at を90日超過したら missed → dormant（Spec §9.4）。旧 DORMANT_AFTER_DAYS(180) は廃止。 */
export const DORMANT_AFTER_DUE_DAYS = 90;
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

/** 確認に答えた/公開された時点からの次回確認日（= 次の verification_request.due_at） */
export function nextVerificationDate(from: Date): Date {
  const next = new Date(from);
  next.setDate(next.getDate() + VERIFICATION_INTERVAL_DAYS);
  return next;
}

/** 依頼が missed 扱いになるか（due_at から DORMANT_AFTER_DUE_DAYS 日以上経過）。Spec §9.4。 */
export function isMissed(dueAt: string | Date, now: Date): boolean {
  return daysSince(dueAt, now) >= DORMANT_AFTER_DUE_DAYS;
}

type SpotInput = Pick<Spot, "status" | "createdAt">;
type OpenRequestInput = Pick<VerificationRequest, "dueAt" | "status"> | null;

/**
 * 次に取るべき状態。日時ベースの遷移のみを判定する（回答イベントは statusAfterAnswer が扱う）。
 * openRequest は対象スポットの open な確認依頼（無ければ null）。
 */
export function nextStatus(
  spot: SpotInput,
  openRequest: OpenRequestInput,
  endorsementCount: number,
  now: Date,
): SpotStatus {
  if (spot.status === "pending") {
    // Spec §9.7: 2人目の承認が期限（created_at+30日）前に成立すれば公開が勝つ（同時刻も公開優先）。
    // canPublish を expired 判定より先に評価することでこれを満たす。
    if (canPublish(endorsementCount)) {
      return "published";
    }
    if (daysSince(spot.createdAt, now) > PENDING_EXPIRY_DAYS) {
      return "expired";
    }
    return "pending";
  }

  if (spot.status === "published") {
    // open の確認依頼が due_at から90日超過していれば missed → dormant。
    if (openRequest && openRequest.status === "open" && isMissed(openRequest.dueAt, now)) {
      return "dormant";
    }
    return "published";
  }

  // dormant / expired は日時ベースでは変化しない。
  // dormant → published の復帰は statusAfterAnswer（回答イベント）が担う。
  // expired は終端状態（Spec §9.7）。以後の承認は受け付けない。
  return spot.status;
}

/**
 * 確認に答えたときの遷移。dormant からの復帰はここが担う（Spec §9.3）。
 * 日時ベースの nextStatus では判定できない回答イベント専用の遷移関数。
 */
export function statusAfterAnswer(current: SpotStatus): SpotStatus {
  if (current === "dormant") {
    return "published";
  }
  return current;
}
