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
  it("30日ちょうどはまだ pending（30日を超えたら expired）", () => {
    const s = { status: "pending" as const, createdAt: daysAgoISO(30) };
    expect(nextStatus(s, null, 0, NOW)).toBe("pending");
  });
  it("31日目で expired", () => {
    const s = { status: "pending" as const, createdAt: daysAgoISO(31) };
    expect(nextStatus(s, null, 0, NOW)).toBe("expired");
  });
  it("Spec §9.7: 29日目に2人目の承認が成立すれば公開が勝つ", () => {
    const s = { status: "pending" as const, createdAt: daysAgoISO(29) };
    expect(nextStatus(s, null, 2, NOW)).toBe("published");
  });
  it("Spec §9.7: 31日目（期限超過後）でも承認2人が集まっていれば公開が勝つ（同時刻は公開優先）", () => {
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

describe("nextStatus（@deprecated 旧3引数シグネチャ）: 後方互換", () => {
  it("pending: 旧シグネチャでも新シグネチャと同じ結果", () => {
    const s = { status: "pending" as const, createdAt: daysAgoISO(31), nextVerificationAt: null };
    expect(nextStatus(s, 2, NOW)).toBe("published");
    expect(nextStatus(s, 0, NOW)).toBe("expired");
  });
  it("published: nextVerificationAt を due_at とみなして同じ90日境界で判定する", () => {
    const base = { status: "published" as const, createdAt: daysAgoISO(300) };
    expect(nextStatus({ ...base, nextVerificationAt: daysAgoISO(89) }, 0, NOW)).toBe("published");
    expect(nextStatus({ ...base, nextVerificationAt: daysAgoISO(90) }, 0, NOW)).toBe("dormant");
    expect(nextStatus({ ...base, nextVerificationAt: daysAgoISO(91) }, 0, NOW)).toBe("dormant");
  });
  it("published: nextVerificationAt が null なら published のまま", () => {
    const s = { status: "published" as const, createdAt: daysAgoISO(10), nextVerificationAt: null };
    expect(nextStatus(s, 0, NOW)).toBe("published");
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
