import { describe, expect, it } from "vitest";
import {
  KEEPER_BADGE_THRESHOLD,
  PORT_BADGE_THRESHOLD,
  POINTS_PER_PUBLISHED_SPOT,
  POINTS_PER_VERIFICATION,
  WINTER_BADGE_THRESHOLD,
  isWinterMonth,
  resolveBadges,
  totalPoints,
} from "./lantern";
import type { LanternInput } from "./lantern";

const BASE: LanternInput = {
  verificationCount: 0,
  winterVerificationCount: 0,
  publishedPortSpotCount: 0,
  publishedSpotCount: 0,
};

describe("totalPoints", () => {
  it("確認1回 +5、公開1件 +10", () => {
    expect(totalPoints({ ...BASE, verificationCount: 1 })).toBe(POINTS_PER_VERIFICATION);
    expect(totalPoints({ ...BASE, publishedSpotCount: 1 })).toBe(POINTS_PER_PUBLISHED_SPOT);
  });

  it("複数の確認・公開を合算する", () => {
    expect(totalPoints({ ...BASE, verificationCount: 13, publishedSpotCount: 3 })).toBe(
      13 * POINTS_PER_VERIFICATION + 3 * POINTS_PER_PUBLISHED_SPOT,
    );
  });
});

describe("resolveBadges", () => {
  it("未取得バッジも常に返す（グレー表示用）", () => {
    const badges = resolveBadges(BASE);
    expect(badges).toHaveLength(3);
    expect(badges.every((b) => !b.earned)).toBe(true);
  });

  it("番人: 確認19回はあと1件、20回で獲得", () => {
    const notYet = resolveBadges({ ...BASE, verificationCount: KEEPER_BADGE_THRESHOLD - 1 }).find(
      (b) => b.slug === "keeper",
    );
    expect(notYet?.earned).toBe(false);
    expect(notYet?.remaining).toBe(1);

    const earned = resolveBadges({ ...BASE, verificationCount: KEEPER_BADGE_THRESHOLD }).find(
      (b) => b.slug === "keeper",
    );
    expect(earned?.earned).toBe(true);
    expect(earned?.remaining).toBe(0);
  });

  it("冬も歩いた: 冬季確認が閾値未満/以上で判定される", () => {
    const notYet = resolveBadges({ ...BASE, winterVerificationCount: WINTER_BADGE_THRESHOLD - 1 }).find(
      (b) => b.slug === "winter",
    );
    expect(notYet?.earned).toBe(false);

    const earned = resolveBadges({ ...BASE, winterVerificationCount: WINTER_BADGE_THRESHOLD }).find(
      (b) => b.slug === "winter",
    );
    expect(earned?.earned).toBe(true);
  });

  it("港: 港町での公開ピンが閾値未満/以上で判定される", () => {
    const notYet = resolveBadges({ ...BASE, publishedPortSpotCount: PORT_BADGE_THRESHOLD - 1 }).find(
      (b) => b.slug === "port",
    );
    expect(notYet?.earned).toBe(false);

    const earned = resolveBadges({ ...BASE, publishedPortSpotCount: PORT_BADGE_THRESHOLD }).find(
      (b) => b.slug === "port",
    );
    expect(earned?.earned).toBe(true);
  });
});

describe("isWinterMonth（12〜2月判定の境界）", () => {
  it("11月30日は冬ではない", () => {
    expect(isWinterMonth("2025-11-30T00:00:00.000Z")).toBe(false);
  });
  it("12月1日は冬", () => {
    expect(isWinterMonth("2025-12-01T00:00:00.000Z")).toBe(true);
  });
  it("1月は冬", () => {
    expect(isWinterMonth("2026-01-15T00:00:00.000Z")).toBe(true);
  });
  it("2月28日は冬", () => {
    expect(isWinterMonth("2026-02-28T00:00:00.000Z")).toBe(true);
  });
  it("うるう年の2月29日も冬", () => {
    expect(isWinterMonth("2024-02-29T00:00:00.000Z")).toBe(true);
  });
  it("3月1日は冬ではない", () => {
    expect(isWinterMonth("2026-03-01T00:00:00.000Z")).toBe(false);
  });
});
