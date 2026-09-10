import { describe, expect, it } from "vitest";
import { compareSpots, sortSpots } from "./ordering";
import type { Spot } from "../db/types";

function spot(overrides: Partial<Spot> & Pick<Spot, "id" | "quietness">): Spot {
  return {
    cityId: "city-1",
    citySlug: "sapporo",
    cityName: "札幌",
    name: overrides.id,
    areaName: null,
    address: null,
    category: null,
    lat: 43.06,
    lng: 141.35,
    status: "published",
    reason: "",
    visitFrequency: "monthly",
    authorId: "author-1",
    authorLabel: null,
    photoUrl: null,
    tags: [],
    endorsementCount: 2,
    verifierCount: 1,
    lastVerifiedAt: null,
    nextVerificationAt: null,
    publishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    distanceMeters: null,
    walkMinutes: null,
    openRequestId: null,
    ...overrides,
  };
}

describe("compareSpots / sortSpots", () => {
  it("quiet → crowding → touristy の順に並ぶ", () => {
    const spots = [
      spot({ id: "touristy-1", quietness: "touristy" }),
      spot({ id: "quiet-1", quietness: "quiet" }),
      spot({ id: "crowding-1", quietness: "crowding" }),
    ];
    expect(sortSpots(spots).map((s) => s.id)).toEqual(["quiet-1", "crowding-1", "touristy-1"]);
  });

  it("同一ステータス内は距離が近い順", () => {
    const spots = [
      spot({ id: "far", quietness: "quiet" }),
      spot({ id: "near", quietness: "quiet" }),
    ];
    const distances = { far: 900, near: 100 };
    expect(sortSpots(spots, distances).map((s) => s.id)).toEqual(["near", "far"]);
  });

  it("距離不明（distances に無い）は Infinity 扱いで最後に回る", () => {
    const spots = [
      spot({ id: "unknown", quietness: "quiet" }),
      spot({ id: "known", quietness: "quiet" }),
    ];
    const distances = { known: 500 };
    expect(sortSpots(spots, distances).map((s) => s.id)).toEqual(["known", "unknown"]);
  });

  it("距離が取れない場合は最終確認が新しい順", () => {
    const spots = [
      spot({ id: "old", quietness: "quiet", lastVerifiedAt: "2026-01-01T00:00:00.000Z" }),
      spot({ id: "new", quietness: "quiet", lastVerifiedAt: "2026-03-01T00:00:00.000Z" }),
    ];
    expect(sortSpots(spots).map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("compareSpots は id まで一致してはじめて0（Spec §9.5でidを4番目のキーに追加したため）", () => {
    const a = spot({ id: "a", quietness: "quiet", lastVerifiedAt: "2026-01-01T00:00:00.000Z" });
    const b = spot({ id: "b", quietness: "quiet", lastVerifiedAt: "2026-01-01T00:00:00.000Z" });
    expect(compareSpots(a, b)).toBeLessThan(0); // id "a" < "b" で決着する（もう0にはならない）
    expect(compareSpots(a, { ...a })).toBe(0); // id含め全キーが同じなら0
  });

  it("元の配列を変更しない", () => {
    const spots = [spot({ id: "b", quietness: "touristy" }), spot({ id: "a", quietness: "quiet" })];
    const original = [...spots];
    sortSpots(spots);
    expect(spots).toEqual(original);
  });

  describe("Spec §9.5: 完全な比較キーの4番目 = id昇順（同着の決定性）", () => {
    it("静けさ・距離・最終確認日時が全て同じなら id 昇順", () => {
      const spots = [
        spot({ id: "z", quietness: "quiet", lastVerifiedAt: "2026-01-01T00:00:00.000Z" }),
        spot({ id: "a", quietness: "quiet", lastVerifiedAt: "2026-01-01T00:00:00.000Z" }),
        spot({ id: "m", quietness: "quiet", lastVerifiedAt: "2026-01-01T00:00:00.000Z" }),
      ];
      expect(sortSpots(spots).map((s) => s.id)).toEqual(["a", "m", "z"]);
    });

    it("距離まで同着なら最終確認日時ではなく id で決まる場合がある（距離同値の同着）", () => {
      const spots = [
        spot({ id: "b", quietness: "quiet", lastVerifiedAt: null }),
        spot({ id: "a", quietness: "quiet", lastVerifiedAt: null }),
      ];
      const distances = { a: 500, b: 500 };
      expect(sortSpots(spots, distances).map((s) => s.id)).toEqual(["a", "b"]);
    });

    it("compareSpots は同一idで0を返す", () => {
      const a = spot({ id: "same", quietness: "quiet" });
      const b = spot({ id: "same", quietness: "quiet" });
      expect(compareSpots(a, b)).toBe(0);
    });
  });
});
