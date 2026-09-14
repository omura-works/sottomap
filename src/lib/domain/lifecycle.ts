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
import { calendarDaysBetweenInTokyo } from "../format/date-time";

export const ENDORSEMENTS_REQUIRED = 2;
export const VERIFICATION_INTERVAL_DAYS = 90;
/** due_at を90日超過したら missed → dormant（Spec §9.4）。旧 DORMANT_AFTER_DAYS(180) は廃止。 */
export const DORMANT_AFTER_DUE_DAYS = 90;
export const PENDING_EXPIRY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function toMillis(value: string | Date): number {
  return (typeof value === "string" ? new Date(value) : value).getTime();
}

/**
 * pending の期限（created_at + 30日）。Spec §9.13.5: 日数の切り捨てではなく絶対時刻で扱う。
 * DB 側（0006 の endorse_spot / run_verification_cron）の `created_at + interval '30 days'` と同じ。
 */
export function pendingDeadline(createdAt: string | Date): Date {
  return new Date(toMillis(createdAt) + PENDING_EXPIRY_DAYS * DAY_MS);
}

/** `now >= created_at + 30日` で期限切れ（Spec §9.13.5）。 */
export function isPendingExpired(createdAt: string | Date, now: Date): boolean {
  return now.getTime() >= pendingDeadline(createdAt).getTime();
}

/**
 * その時刻の承認が期限内か。Spec §9.7「同時刻なら公開を優先」により、期限ちょうどの承認は期限内に数える。
 * （期限ちょうどの瞬間は isPendingExpired も真になるが、nextStatus は公開判定を先に行う。）
 */
export function isEndorsementOnTime(createdAt: string | Date, endorsedAt: string | Date): boolean {
  return toMillis(endorsedAt) <= pendingDeadline(createdAt).getTime();
}

/** pending のスポットが公開条件を満たしたか（投稿者自身の承認は除外済みの数を渡す） */
export function canPublish(endorsementCount: number): boolean {
  return endorsementCount >= ENDORSEMENTS_REQUIRED;
}

/** '前回の確認から92日' の 92 を出す */
export function daysSince(from: string | Date, now: Date): number {
  return calendarDaysBetweenInTokyo(from, now);
}

/** 確認に答えた/公開された時点からの次回確認日（= 次の verification_request.due_at） */
export function nextVerificationDate(from: Date): Date {
  return new Date(from.getTime() + VERIFICATION_INTERVAL_DAYS * DAY_MS);
}

/** 依頼が missed 扱いになるか（due_at から DORMANT_AFTER_DUE_DAYS 日以上経過）。Spec §9.4。 */
export function isMissed(dueAt: string | Date, now: Date): boolean {
  return now.getTime() >= toMillis(dueAt) + DORMANT_AFTER_DUE_DAYS * DAY_MS;
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
    // Spec §9.13.5: 期限は絶対時刻（now >= created_at + 30日）。
    if (isPendingExpired(spot.createdAt, now)) {
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

// =========================================================
// 確認に回答できる時点（Spec §9.13.3）
// DB 側の answer_verification（0006_security_hardening.sql）と同じ規則。フィクスチャ経路・画面・
// プロフィールの件数表示はすべてこの関数で判定する。
// =========================================================

/**
 * - `answerable`: 回答を受け付ける（期限到来済みの open、または dormant 復帰の対象になる最新の missed）
 * - `not-due`: まだ期限前の open（画面には「確認待ち」として出さない）
 * - `closed`: 回答済み、または復帰の対象ではない missed
 */
export type AnswerEligibility = "answerable" | "not-due" | "closed";

type EligibilityRequestInput = Pick<VerificationRequest, "id" | "status" | "dueAt">;

export function answerEligibility(
  request: EligibilityRequestInput,
  spotStatus: SpotStatus,
  latestMissedRequestId: string | null,
  now: Date,
): AnswerEligibility {
  if (request.status === "open") {
    return toMillis(request.dueAt) <= now.getTime() ? "answerable" : "not-due";
  }
  if (request.status === "missed") {
    // dormant からの復帰（§9.3）: スポットが dormant のとき、最新の missed 依頼にだけ1回答えられる。
    // 受理すると依頼は answered になるため、同じ依頼で二度目の復帰は起きない。
    return spotStatus === "dormant" && request.id === latestMissedRequestId ? "answerable" : "closed";
  }
  return "closed";
}

type LatestMissedInput = Pick<VerificationRequest, "id" | "spotId" | "status" | "dueAt" | "createdAt">;

/**
 * 対象スポットの最新の missed 依頼ID。並びは DB 側と同じ `due_at desc, created_at desc, id desc`。
 */
export function latestMissedRequestId(requests: LatestMissedInput[], spotId: string): string | null {
  let latest: LatestMissedInput | null = null;
  for (const request of requests) {
    if (request.spotId !== spotId || request.status !== "missed") continue;
    if (!latest || compareRequestsNewestFirst(request, latest) < 0) latest = request;
  }
  return latest ? latest.id : null;
}

function compareRequestsNewestFirst(a: LatestMissedInput, b: LatestMissedInput): number {
  const byDue = toMillis(b.dueAt) - toMillis(a.dueAt);
  if (byDue !== 0) return byDue;
  const byCreated = toMillis(b.createdAt) - toMillis(a.createdAt);
  if (byCreated !== 0) return byCreated;
  if (a.id === b.id) return 0;
  return a.id > b.id ? -1 : 1;
}

/** 回答可能な依頼の件数（/me の「確認待ちがN件あります」）。 */
export function countAnswerableRequests(
  requests: Array<LatestMissedInput & { spotStatus: SpotStatus }>,
  now: Date,
): number {
  return requests.filter(
    (request) =>
      answerEligibility(request, request.spotStatus, latestMissedRequestId(requests, request.spotId), now) ===
      "answerable",
  ).length;
}
