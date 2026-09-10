// Supabase 未接続（テスト環境には NEXT_PUBLIC_SUPABASE_URL 等が無い）を利用して、
// src/lib/db/spots.ts のフィクスチャ・フォールバック経路を検証する。
// 実DBに接続する分岐（src/lib/supabase/server.ts 経由）はここでは通らない。

import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
});

describe("listCities / getCity", () => {
  it("街8件を返す", async () => {
    const { listCities } = await import("./spots");
    const cities = await listCities();
    expect(cities).toHaveLength(8);
    expect(cities.map((c) => c.slug)).toEqual(
      expect.arrayContaining(["sapporo", "otaru", "hakodate", "asahikawa", "furano", "kushiro", "obihiro", "wakkanai"]),
    );
  });

  it("slug で1件取得できる", async () => {
    const { getCity } = await import("./spots");
    const city = await getCity("sapporo");
    expect(city?.name).toBe("札幌");
  });

  it("存在しない slug は null", async () => {
    const { getCity } = await import("./spots");
    expect(await getCity("nowhere")).toBeNull();
  });
});

describe("listSpots", () => {
  it("published のみ、sortSpots を通した順で返す（quiet が先）", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "sapporo" });
    expect(spots.every((s) => s.status === "published")).toBe(true);
    expect(spots.map((s) => s.quietness)).toEqual(["quiet", "quiet", "crowding"]);
  });

  it("filters: quiet-now で crowding/touristy を除外する", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "sapporo", filters: ["quiet-now"] });
    expect(spots.every((s) => s.quietness === "quiet")).toBe(true);
  });

  it("q で名前・理由を検索できる", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "sapporo", q: "ザンギ" });
    expect(spots).toHaveLength(1);
    expect(spots[0].name).toBe("札幌ザンギ本舗");
  });

  it("limit で件数を絞れる", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "sapporo", limit: 1 });
    expect(spots).toHaveLength(1);
  });

  it("タグ slug フィルタで絞り込める", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "sapporo", filters: ["fish-shop-direct"] });
    expect(spots.map((s) => s.name)).toEqual(["シハチ鮮魚店 北24条店"]);
  });
});

describe("getSpot / listVerifications", () => {
  it("id でスポットを1件取得できる", async () => {
    const { getSpot } = await import("./spots");
    const spot = await getSpot("d0000000-0000-4000-8000-000000000001");
    expect(spot?.name).toBe("シハチ鮮魚店 北24条店");
  });

  it("存在しない id は null", async () => {
    const { getSpot } = await import("./spots");
    expect(await getSpot("does-not-exist")).toBeNull();
  });

  it("確認履歴を新しい順で返す", async () => {
    const { listVerifications } = await import("./spots");
    const verifications = await listVerifications("d0000000-0000-4000-8000-000000000006");
    expect(verifications).toHaveLength(4);
    const times = verifications.map((v) => new Date(v.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});

describe("listPendingSpots", () => {
  it("フィクスチャに pending は無いため空配列", async () => {
    const { listPendingSpots } = await import("./spots");
    const spots = await listPendingSpots("sapporo", "b0000000-0000-4000-8000-000000000001");
    expect(spots).toEqual([]);
  });
});

describe("listBookmarks", () => {
  it("ユーザーの栞を spot 込みで返す（Spec §9.8 S8: 4件）", async () => {
    const { listBookmarks } = await import("./spots");
    const bookmarks = await listBookmarks("b0000000-0000-4000-8000-000000000004");
    expect(bookmarks).toHaveLength(4);
    expect(bookmarks.map((b) => b.spot.name)).toEqual(
      expect.arrayContaining(["シハチ鮮魚店 北24条店", "聖徳太子 飛鳥店", "南樽市場", "鱗友朝市"]),
    );
  });

  it("栞の無いユーザーは空配列", async () => {
    const { listBookmarks } = await import("./spots");
    expect(await listBookmarks("nobody")).toEqual([]);
  });
});

describe("countPublishedSpots / countQuietSpots", () => {
  it("街ごとの公開件数を数える", async () => {
    const { countPublishedSpots } = await import("./spots");
    expect(await countPublishedSpots("sapporo")).toBe(3);
    expect(await countPublishedSpots("otaru")).toBe(3);
  });

  it("quiet のみを数える（鱗友朝市=touristy は除外）", async () => {
    const { countQuietSpots } = await import("./spots");
    expect(await countQuietSpots("otaru")).toBe(2);
  });
});

describe("listRecentlyVerified", () => {
  it("直近7日に確認があった店を verifierCount 付きで返す", async () => {
    const { listRecentlyVerified } = await import("./spots");
    const result = await listRecentlyVerified("sapporo");
    expect(result.map((r) => r.spot.name)).toEqual([
      "シハチ鮮魚店 北24条店",
      "札幌ザンギ本舗",
      "札幌らーめん輝風 すすきの店",
    ]);
    expect(result.every((r) => r.verifierCount >= 1)).toBe(true);
  });

  it("Spec §9.8/§1: シハチ3人・ザンギ5人・輝風4人の確認人数になっている", async () => {
    const { listRecentlyVerified } = await import("./spots");
    const result = await listRecentlyVerified("sapporo");
    const byName = new Map(result.map((r) => [r.spot.name, r.verifierCount]));
    expect(byName.get("シハチ鮮魚店 北24条店")).toBe(3);
    expect(byName.get("札幌ザンギ本舗")).toBe(5);
    expect(byName.get("札幌らーめん輝風 すすきの店")).toBe(4);
  });
});

describe("City.featuredArea（CONTRACT追補）", () => {
  it("札幌は「北24条」、小樽は「色内」を持つ", async () => {
    const { getCity } = await import("./spots");
    expect((await getCity("sapporo"))?.featuredArea).toBe("北24条");
    expect((await getCity("otaru"))?.featuredArea).toBe("色内");
  });

  it("代表エリアが無い街は null", async () => {
    const { getCity } = await import("./spots");
    expect((await getCity("hakodate"))?.featuredArea).toBeNull();
  });
});

describe("distanceMeters / walkMinutes（CONTRACT追補）", () => {
  it("origin を渡すと距離・徒歩分が埋まる", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "sapporo", origin: { lat: 43.0621, lng: 141.3544 } });
    expect(spots.every((s) => typeof s.distanceMeters === "number")).toBe(true);
    expect(spots.every((s) => typeof s.walkMinutes === "number" && s.walkMinutes >= 1)).toBe(true);
  });

  it("origin が無ければ街の中心から算出する（null にならない）", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "sapporo" });
    expect(spots.every((s) => s.distanceMeters !== null)).toBe(true);
  });

  it("getSpot でも街の中心からの距離が埋まる", async () => {
    const { getSpot } = await import("./spots");
    const spot = await getSpot("d0000000-0000-4000-8000-000000000001");
    expect(spot?.distanceMeters).not.toBeNull();
    expect(spot?.walkMinutes).not.toBeNull();
  });
});

describe("openRequestId（Spec §9.1・CONTRACT追補）", () => {
  it("公開スポットには open な確認依頼IDが入る", async () => {
    const { getSpot } = await import("./spots");
    const spot = await getSpot("d0000000-0000-4000-8000-000000000001");
    expect(spot?.openRequestId).toBeTruthy();
  });
});

describe("getVerificationRequest / listOpenRequests（Spec §9.1）", () => {
  it("id で確認依頼を1件取得できる", async () => {
    const { getSpot, getVerificationRequest } = await import("./spots");
    const spot = await getSpot("d0000000-0000-4000-8000-000000000001");
    const request = await getVerificationRequest(spot!.openRequestId as string);
    expect(request?.spotId).toBe(spot!.id);
    expect(request?.status).toBe("open");
  });

  it("存在しない id は null", async () => {
    const { getVerificationRequest } = await import("./spots");
    expect(await getVerificationRequest("does-not-exist")).toBeNull();
  });

  it("ユーザーの open な依頼一覧を返す", async () => {
    const { listOpenRequests } = await import("./spots");
    const requests = await listOpenRequests("b0000000-0000-4000-8000-000000000001");
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((r) => r.status === "open")).toBe(true);
  });
});

describe("getUserProfile / getProfileStats / listSpotsByAuthor（CONTRACT追補）", () => {
  it("getUserProfile: Kさんのプロフィールを返す", async () => {
    const { getUserProfile } = await import("./spots");
    const profile = await getUserProfile("b0000000-0000-4000-8000-000000000001");
    expect(profile?.displayName).toBe("Kさん");
    expect(profile?.areaName).toBe("北24条");
  });

  it("getUserProfile: 存在しないユーザーは null", async () => {
    const { getUserProfile } = await import("./spots");
    expect(await getUserProfile("nobody")).toBeNull();
  });

  it("getProfileStats: Kさんは1件投稿・複数回確認している", async () => {
    const { getProfileStats } = await import("./spots");
    const stats = await getProfileStats("b0000000-0000-4000-8000-000000000001");
    expect(stats.spotsCreated).toBe(1);
    expect(stats.verificationsAnswered).toBeGreaterThan(0);
  });

  it("listSpotsByAuthor: Kさんが投稿したスポットのみ返す", async () => {
    const { listSpotsByAuthor } = await import("./spots");
    const spots = await listSpotsByAuthor("b0000000-0000-4000-8000-000000000001");
    expect(spots).toHaveLength(1);
    expect(spots[0].name).toBe("シハチ鮮魚店 北24条店");
  });
});
