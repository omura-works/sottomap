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

  it("compareSpots は sortSpots と整合する（0 は同順）", () => {
    const a = spot({ id: "a", quietness: "quiet", lastVerifiedAt: "2026-01-01T00:00:00.000Z" });
    const b = spot({ id: "b", quietness: "quiet", lastVerifiedAt: "2026-01-01T00:00:00.000Z" });
    expect(compareSpots(a, b)).toBe(0);
  });

  it("元の配列を変更しない", () => {
    const spots = [spot({ id: "b", quietness: "touristy" }), spot({ id: "a", quietness: "quiet" })];
    const original = [...spots];
    sortSpots(spots);
    expect(spots).toEqual(original);
  });
});
