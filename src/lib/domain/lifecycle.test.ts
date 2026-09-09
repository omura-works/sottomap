import { describe, expect, it } from "vitest";
import {
  DORMANT_AFTER_DAYS,
  ENDORSEMENTS_REQUIRED,
  PENDING_EXPIRY_DAYS,
  VERIFICATION_INTERVAL_DAYS,
  canPublish,
  daysSince,
  nextStatus,
  nextVerificationDate,
} from "./lifecycle";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function daysAgoISO(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("定数", () => {
  it("Spec §2.2/§2.3 の値と一致する", () => {
    expect(ENDORSEMENTS_REQUIRED).toBe(2);
    expect(VERIFICATION_INTERVAL_DAYS).toBe(90);
    expect(PENDING_EXPIRY_DAYS).toBe(30);
    expect(DORMANT_AFTER_DAYS).toBe(180);
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

describe("nextStatus: pending の承認待ち境界", () => {
  const pendingSpot = { status: "pending" as const, createdAt: daysAgoISO(1), nextVerificationAt: null };

  it("承認1人はそのまま pending", () => {
    expect(nextStatus(pendingSpot, 1, NOW)).toBe("pending");
  });
  it("承認2人で published", () => {
    expect(nextStatus(pendingSpot, 2, NOW)).toBe("published");
  });
});

describe("nextStatus: pending → expired の30日境界", () => {
  it("29日経過はまだ pending", () => {
    const s = { status: "pending" as const, createdAt: daysAgoISO(29), nextVerificationAt: null };
    expect(nextStatus(s, 0, NOW)).toBe("pending");
  });
  it("30日ちょうどはまだ pending（30日を超えたら expired）", () => {
    const s = { status: "pending" as const, createdAt: daysAgoISO(30), nextVerificationAt: null };
    expect(nextStatus(s, 0, NOW)).toBe("pending");
  });
  it("31日経過で expired", () => {
    const s = { status: "pending" as const, createdAt: daysAgoISO(31), nextVerificationAt: null };
    expect(nextStatus(s, 0, NOW)).toBe("expired");
  });
  it("承認2人集まっていれば30日超でも published が優先", () => {
    const s = { status: "pending" as const, createdAt: daysAgoISO(31), nextVerificationAt: null };
    expect(nextStatus(s, 2, NOW)).toBe("published");
  });
});

describe("nextStatus: published → dormant の期限+90日境界（89日/90日/91日）", () => {
  it("期限から89日: まだ published", () => {
    const s = { status: "published" as const, createdAt: daysAgoISO(300), nextVerificationAt: daysAgoISO(89) };
    expect(nextStatus(s, 0, NOW)).toBe("published");
  });
  it("期限から90日ちょうど: dormant", () => {
    const s = { status: "published" as const, createdAt: daysAgoISO(300), nextVerificationAt: daysAgoISO(90) };
    expect(nextStatus(s, 0, NOW)).toBe("dormant");
  });
  it("期限から91日: dormant", () => {
    const s = { status: "published" as const, createdAt: daysAgoISO(300), nextVerificationAt: daysAgoISO(91) };
    expect(nextStatus(s, 0, NOW)).toBe("dormant");
  });
  it("次回確認日がまだ未来なら published のまま", () => {
    const s = {
      status: "published" as const,
      createdAt: daysAgoISO(10),
      nextVerificationAt: new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    };
    expect(nextStatus(s, 0, NOW)).toBe("published");
  });
});

describe("nextStatus: dormant / expired は変化しない", () => {
  it("dormant はそのまま", () => {
    const s = { status: "dormant" as const, createdAt: daysAgoISO(400), nextVerificationAt: daysAgoISO(200) };
    expect(nextStatus(s, 0, NOW)).toBe("dormant");
  });
  it("expired はそのまま", () => {
    const s = { status: "expired" as const, createdAt: daysAgoISO(400), nextVerificationAt: null };
    expect(nextStatus(s, 5, NOW)).toBe("expired");
  });
});
