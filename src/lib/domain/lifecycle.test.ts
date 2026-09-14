import { describe, expect, it } from "vitest";
import {
  DORMANT_AFTER_DUE_DAYS,
  ENDORSEMENTS_REQUIRED,
  PENDING_EXPIRY_DAYS,
  VERIFICATION_INTERVAL_DAYS,
  canPublish,
  daysSince,
  isMissed,
  nextStatus,
  nextVerificationDate,
  statusAfterAnswer,
  answerEligibility,
  countAnswerableRequests,
  isEndorsementOnTime,
  isPendingExpired,
  latestMissedRequestId,
  pendingDeadline,
} from "./lifecycle";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function daysAgoISO(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("定数", () => {
  it("Spec §9.4 の値と一致する（DORMANT_AFTER_DAYS は廃止・DORMANT_AFTER_DUE_DAYS=90）", () => {
    expect(ENDORSEMENTS_REQUIRED).toBe(2);
    expect(VERIFICATION_INTERVAL_DAYS).toBe(90);
    expect(PENDING_EXPIRY_DAYS).toBe(30);
    expect(DORMANT_AFTER_DUE_DAYS).toBe(90);
  });
});

describe("canPublish", () => {
  it("承認1人では公開しない", () => {
    expect(canPublish(1)).toBe(false);
  });
  it("承認2人で公開できる", () => {
    expect(canPublish(2)).toBe(true);
  });
  it("承認0人では公開しない", () => {
    expect(canPublish(0)).toBe(false);
  });
});

describe("daysSince", () => {
  it("日数差をそのまま返す", () => {
    expect(daysSince(daysAgoISO(92), NOW)).toBe(92);
  });
  it("文字列でも Date でも同じ結果", () => {
    const d = new Date(daysAgoISO(10));
    expect(daysSince(d, NOW)).toBe(daysSince(daysAgoISO(10), NOW));
  });
  it("24時間未満でも日本時間の暦日をまたげば1日と数える", () => {
    const from = new Date("2026-09-14T14:30:00.000Z");
    const now = new Date("2026-09-14T15:30:00.000Z");
    expect(daysSince(from, now)).toBe(1);
  });
});

describe("nextVerificationDate", () => {
  it("90日後を返す", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const next = nextVerificationDate(from);
    expect(daysSince(from, next)).toBe(90);
  });
});

describe("isMissed: due_at 前日/当日/翌日の境界（Spec §9.4）", () => {
  it("due_at から89日（前日）: まだ missed でない", () => {
    expect(isMissed(daysAgoISO(89), NOW)).toBe(false);
  });
  it("due_at から90日ちょうど（当日）: missed", () => {
    expect(isMissed(daysAgoISO(90), NOW)).toBe(true);
  });
  it("due_at から91日（翌日）: missed", () => {
    expect(isMissed(daysAgoISO(91), NOW)).toBe(true);
  });
});

describe("nextStatus（新シグネチャ）: pending の承認待ち境界", () => {
  const pendingSpot = { status: "pending" as const, createdAt: daysAgoISO(1) };

  it("承認1人はそのまま pending", () => {
    expect(nextStatus(pendingSpot, null, 1, NOW)).toBe("pending");
  });
  it("承認2人で published", () => {
    expect(nextStatus(pendingSpot, null, 2, NOW)).toBe("published");
  });
});

describe("nextStatus（新シグネチャ）: pending → expired の30日境界", () => {
  it("29日目はまだ pending", () => {
    const s = { status: "pending" as const, createdAt: daysAgoISO(29) };
    expect(nextStatus(s, null, 0, NOW)).toBe("pending");
  });
  it("Spec §9.13.5: 30日ちょうど（now >= created_at + 30日）で expired", () => {
    const s = { status: "pending" as const, createdAt: daysAgoISO(30) };
    expect(nextStatus(s, null, 0, NOW)).toBe("expired");
  });
  it("Spec §9.13.5: created_at + 30日 + 1時間は expired（日数の切り捨てで30日扱いにしない）", () => {
    const createdAt = new Date(NOW.getTime() - (30 * 24 + 1) * 60 * 60 * 1000).toISOString();
    expect(nextStatus({ status: "pending", createdAt }, null, 0, NOW)).toBe("expired");
  });
  it("期限の1ミリ秒前はまだ pending", () => {
    const createdAt = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000 + 1).toISOString();
    expect(nextStatus({ status: "pending", createdAt }, null, 0, NOW)).toBe("pending");
  });
  it("31日目で expired", () => {
    const s = { status: "pending" as const, createdAt: daysAgoISO(31) };
    expect(nextStatus(s, null, 0, NOW)).toBe("expired");
  });
  it("Spec §9.7: 29日目に2人目の承認が成立すれば公開が勝つ", () => {
    const s = { status: "pending" as const, createdAt: daysAgoISO(29) };
    expect(nextStatus(s, null, 2, NOW)).toBe("published");
  });
  it("Spec §9.7: 期限前に成立した承認数が2人なら cron 実行が31日目でも公開が勝つ", () => {
    const s = { status: "pending" as const, createdAt: daysAgoISO(31) };
    expect(nextStatus(s, null, 2, NOW)).toBe("published");
  });
});

describe("nextStatus（新シグネチャ）: published → dormant（openRequest の due_at 経由）", () => {
  it("open な確認依頼が無ければ published のまま（守りの分岐）", () => {
    const s = { status: "published" as const, createdAt: daysAgoISO(300) };
    expect(nextStatus(s, null, 0, NOW)).toBe("published");
  });
  it("due_at から89日: まだ published", () => {
    const s = { status: "published" as const, createdAt: daysAgoISO(300) };
    const openRequest = { dueAt: daysAgoISO(89), status: "open" as const };
    expect(nextStatus(s, openRequest, 0, NOW)).toBe("published");
  });
  it("due_at から90日ちょうど: dormant", () => {
    const s = { status: "published" as const, createdAt: daysAgoISO(300) };
    const openRequest = { dueAt: daysAgoISO(90), status: "open" as const };
    expect(nextStatus(s, openRequest, 0, NOW)).toBe("dormant");
  });
  it("due_at から91日: dormant", () => {
    const s = { status: "published" as const, createdAt: daysAgoISO(300) };
    const openRequest = { dueAt: daysAgoISO(91), status: "open" as const };
    expect(nextStatus(s, openRequest, 0, NOW)).toBe("dormant");
  });
  it("due_at がまだ未来なら published のまま", () => {
    const s = { status: "published" as const, createdAt: daysAgoISO(10) };
    const futureDue = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(nextStatus(s, { dueAt: futureDue, status: "open" }, 0, NOW)).toBe("published");
  });
  it("依頼が既に answered なら（open でない）dormant 判定をしない", () => {
    const s = { status: "published" as const, createdAt: daysAgoISO(300) };
    const openRequest = { dueAt: daysAgoISO(200), status: "answered" as const };
    expect(nextStatus(s, openRequest, 0, NOW)).toBe("published");
  });
});

describe("nextStatus（新シグネチャ）: dormant / expired は日時ベースでは変化しない", () => {
  it("dormant はそのまま（復帰は statusAfterAnswer が担う）", () => {
    const s = { status: "dormant" as const, createdAt: daysAgoISO(400) };
    expect(nextStatus(s, null, 0, NOW)).toBe("dormant");
  });
  it("expired はそのまま（終端状態。以後の承認も無視）", () => {
    const s = { status: "expired" as const, createdAt: daysAgoISO(400) };
    expect(nextStatus(s, null, 5, NOW)).toBe("expired");
  });
});

describe("statusAfterAnswer（Spec §9.3: dormant → published の復帰）", () => {
  it("dormant で答えると published に復帰する", () => {
    expect(statusAfterAnswer("dormant")).toBe("published");
  });
  it("published で答えても published のまま", () => {
    expect(statusAfterAnswer("published")).toBe("published");
  });
  it("pending / expired はそのまま（本来この関数を呼ぶ経路が無い状態）", () => {
    expect(statusAfterAnswer("pending")).toBe("pending");
    expect(statusAfterAnswer("expired")).toBe("expired");
  });
});

describe("pending の期限（Spec §9.13.5・絶対時刻）", () => {
  const createdAt = "2026-01-01T09:00:00.000Z";

  it("期限は created_at + 30日ちょうど", () => {
    expect(pendingDeadline(createdAt).toISOString()).toBe("2026-01-31T09:00:00.000Z");
  });
  it("isPendingExpired: 期限の時刻以降が期限切れ", () => {
    expect(isPendingExpired(createdAt, new Date("2026-01-31T08:59:59.999Z"))).toBe(false);
    expect(isPendingExpired(createdAt, new Date("2026-01-31T09:00:00.000Z"))).toBe(true);
    expect(isPendingExpired(createdAt, new Date("2026-01-31T10:00:00.000Z"))).toBe(true);
  });
  it("isEndorsementOnTime: 期限ちょうどの承認は期限内（同時刻は公開優先）、1ミリ秒後は期限外", () => {
    expect(isEndorsementOnTime(createdAt, "2026-01-31T09:00:00.000Z")).toBe(true);
    expect(isEndorsementOnTime(createdAt, "2026-01-31T09:00:00.001Z")).toBe(false);
  });
});

describe("answerEligibility（Spec §9.13.3）", () => {
  const now = new Date("2026-09-14T00:00:00.000Z");
  const past = "2026-09-13T00:00:00.000Z";
  const future = "2026-09-15T00:00:00.000Z";

  it("期限到来済みの open は回答できる（due_at ちょうども含む）", () => {
    expect(answerEligibility({ id: "r1", status: "open", dueAt: past }, "published", null, now)).toBe("answerable");
    expect(answerEligibility({ id: "r1", status: "open", dueAt: now.toISOString() }, "published", null, now)).toBe(
      "answerable",
    );
  });
  it("期限前の open は回答できない（not-due）", () => {
    expect(answerEligibility({ id: "r1", status: "open", dueAt: future }, "published", null, now)).toBe("not-due");
  });
  it("answered は回答できない", () => {
    expect(answerEligibility({ id: "r1", status: "answered", dueAt: past }, "published", null, now)).toBe("closed");
  });
  it("dormant のスポットの最新 missed だけが回答できる", () => {
    expect(answerEligibility({ id: "m2", status: "missed", dueAt: past }, "dormant", "m2", now)).toBe("answerable");
    expect(answerEligibility({ id: "m1", status: "missed", dueAt: past }, "dormant", "m2", now)).toBe("closed");
  });
  it("スポットが dormant でなければ missed には回答できない", () => {
    expect(answerEligibility({ id: "m2", status: "missed", dueAt: past }, "published", "m2", now)).toBe("closed");
  });
});

describe("latestMissedRequestId / countAnswerableRequests", () => {
  const now = new Date("2026-09-14T00:00:00.000Z");
  const base = { spotId: "s1", createdAt: "2025-01-01T00:00:00.000Z" };

  it("due_at が最も新しい missed を返す（他のスポット・他の状態は無視）", () => {
    const requests = [
      { ...base, id: "m-old", status: "missed" as const, dueAt: "2025-03-01T00:00:00.000Z" },
      { ...base, id: "m-new", status: "missed" as const, dueAt: "2025-09-01T00:00:00.000Z" },
      { ...base, id: "a", status: "answered" as const, dueAt: "2026-01-01T00:00:00.000Z" },
      { ...base, spotId: "s2", id: "other", status: "missed" as const, dueAt: "2026-02-01T00:00:00.000Z" },
    ];
    expect(latestMissedRequestId(requests, "s1")).toBe("m-new");
    expect(latestMissedRequestId(requests, "s3")).toBeNull();
  });

  it("回答できる依頼（期限到来の open ＋ 復帰できる最新 missed）だけを数える", () => {
    const requests = [
      { ...base, id: "due", spotId: "p1", status: "open" as const, dueAt: "2026-09-01T00:00:00.000Z", spotStatus: "published" as const },
      { ...base, id: "future", spotId: "p2", status: "open" as const, dueAt: "2026-12-01T00:00:00.000Z", spotStatus: "published" as const },
      { ...base, id: "m-old", spotId: "d1", status: "missed" as const, dueAt: "2025-03-01T00:00:00.000Z", spotStatus: "dormant" as const },
      { ...base, id: "m-new", spotId: "d1", status: "missed" as const, dueAt: "2025-09-01T00:00:00.000Z", spotStatus: "dormant" as const },
    ];
    expect(countAnswerableRequests(requests, now)).toBe(2);
  });
});
