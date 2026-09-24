// デモモード（vitest.config.ts が URASUPO_DEMO_MODE=1 を渡す）で、src/lib/db/spots.ts のフィクスチャ経路を検証する。
// 実DBに接続する分岐のうち、PostgREST の応答から Spot を組み立てる部分は spots.postgrest.test.ts で検証する。

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
  it("published のみ、sortSpots を通した順で返す（静けさ → 街の中心からの距離）", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "sapporo" });
    expect(spots.every((s) => s.status === "published")).toBe(true);
    // 札幌の中心（43.0621, 141.3544）から: ザンギ約0.8km・シハチ約2.5km／輝風約0.7km・大通の2店は約0.7km・約0.9km
    expect(spots.map((s) => [s.quietness, s.name])).toEqual([
      ["quiet", "札幌ザンギ本舗"],
      ["quiet", "シハチ鮮魚店 北24条店"],
      ["crowding", "札幌らーめん輝風 すすきの店"],
      ["crowding", "大通の小さな定食屋"],
      ["crowding", "大通の古い蕎麦屋"],
    ]);
  });

  it("q は前後の空白を除いて、地域名（area_name）も検索する", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "otaru", q: "  色内 " });
    expect(spots.map((s) => s.name)).toEqual(["鱗友朝市"]);
  });

  it("空白だけの q は全件（§9.10 空検索）", async () => {
    const { listSpots } = await import("./spots");
    expect(await listSpots({ citySlug: "otaru", q: "   " })).toHaveLength(3);
  });

  it("filters: quiet-now は絞り込まない（SPEC §9.14-5: 表示側の並べ替え専用）", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "sapporo", filters: ["quiet-now"] });
    expect(spots.some((s) => s.quietness === "crowding")).toBe(true);
    expect(spots).toHaveLength(5);
  });

  it("q で名前・理由を検索できる", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "sapporo", q: "ザンギ" });
    expect(spots).toHaveLength(1);
    expect(spots[0].name).toBe("札幌ザンギ本舗");
  });

  it("limit で件数を絞れる（並べてから絞る）", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "sapporo", limit: 1 });
    expect(spots.map((s) => s.name)).toEqual(["札幌ザンギ本舗"]);
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
  it("同じ街の利用者へ、承認1件済みの pending を返す", async () => {
    const { listPendingSpots } = await import("./spots");
    const spots = await listPendingSpots("sapporo", "b0000000-0000-4000-8000-000000000004");

    expect(spots).toHaveLength(1);
    expect(spots[0]).toMatchObject({
      name: "北24条の小さな喫茶店",
      status: "pending",
      endorsementCount: 1,
    });
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
    // 札幌は実在3店＋デモモード専用の架空2店（fixtures.ts 冒頭の注記）
    expect(await countPublishedSpots("sapporo")).toBe(5);
    expect(await countPublishedSpots("otaru")).toBe(3);
  });

  it("quiet のみを数える（鱗友朝市=touristy は除外）", async () => {
    const { countQuietSpots } = await import("./spots");
    expect(await countQuietSpots("otaru")).toBe(2);
  });
});

describe("listRecentlyVerified", () => {
  it("直近7日に確認があった店を verifierCount 付きで、§9.5 の順（静けさ → 街の中心からの距離）で返す", async () => {
    const { listRecentlyVerified } = await import("./spots");
    const result = await listRecentlyVerified("sapporo");
    expect(result.map((r) => r.spot.name)).toEqual([
      "札幌ザンギ本舗",
      "シハチ鮮魚店 北24条店",
      "札幌らーめん輝風 すすきの店",
    ]);
    expect(result.every((r) => r.spot.distanceMeters !== null)).toBe(true);
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
    // R21 軽微3（§9.18-2）: エリア・居住年数は集めない・表示しないので、プロフィールの型にも持たない。
    expect(Object.keys(profile!).sort()).toEqual([
      "avatarUrl",
      "createdAt",
      "displayName",
      "homeCityChangedAt",
      "homeCityId",
      "id",
      "lanternPoints",
    ]);
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

  it("getProfileStats: 確認待ちは回答できる依頼だけ数える（デモ利用者は期限到来済みの1件のみ。期限前の1件は数えない）", async () => {
    const { getProfileStats, getVerificationRequest, getSpot } = await import("./spots");
    const due = await getVerificationRequest("80000000-0000-4000-8000-000000000008");
    const notYet = await getVerificationRequest("80000000-0000-4000-8000-000000000009");
    // デモ利用者（札幌在住）の依頼は札幌のスポットに付いている
    expect((await getSpot(due!.spotId))?.citySlug).toBe("sapporo");
    expect((await getSpot(notYet!.spotId))?.citySlug).toBe("sapporo");
    expect(due?.userId).toBe("b0000000-0000-4000-8000-000000000004");
    expect(notYet?.userId).toBe("b0000000-0000-4000-8000-000000000004");
    expect(new Date(due!.dueAt).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(notYet!.dueAt).getTime()).toBeGreaterThan(Date.now());

    const stats = await getProfileStats("b0000000-0000-4000-8000-000000000004");
    expect(stats.pendingRequestCount).toBe(1);
  });

  it("getLatestMissedRequestId: missed が無いスポットは null", async () => {
    const { getLatestMissedRequestId } = await import("./spots");
    expect(await getLatestMissedRequestId("d0000000-0000-4000-8000-000000000004")).toBeNull();
  });
});

describe("listVerifications（デモモード。§9.18-2・0012）", () => {
  it("実DBと同じく公開列（id, spotId, answer, createdAt）だけを返し、回答者と備考は出さない", async () => {
    const { listVerifications } = await import("./spots");
    const verifications = await listVerifications("d0000000-0000-4000-8000-000000000006");
    expect(verifications.length).toBeGreaterThan(0);
    for (const v of verifications) {
      expect(Object.keys(v).sort()).toEqual(["answer", "createdAt", "id", "spotId"]);
    }
  });
});
