import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveQuietness } from "../domain/quietness";

describe("栞の予定日時フィクスチャ", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("現在時刻に関係なく日本時間で翌日の12:30になる", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T10:00:00.000Z"));
    vi.resetModules();

    const { FIXTURE_BOOKMARKS } = await import("./fixtures");
    const bookmark = FIXTURE_BOOKMARKS.find(
      (candidate) => candidate.id === "90000000-0000-4000-8000-000000000001",
    );

    expect(bookmark?.plannedAt).toBe("2026-09-15T03:30:00.000Z");
  });
});

describe("seed.sql との一致（実在の店 82 軒）", () => {
  interface SeedSpot {
    citySlug: string;
    status: string;
    quietness: string;
    authorId: string;
  }

  function readSeedSpots(): Map<string, SeedSpot> {
    const sql = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");
    const pattern =
      /'(d0000000-[0-9a-f-]+)',\s*\(select id from cities where slug = '(\w+)'\),[\s\S]*?'(pending|published|dormant|expired)', '(quiet|crowding|touristy)',[\s\S]*?'(?:weekly|monthly|yearly)',\s*'(b0000000-[0-9a-f-]+)'/g;
    const spots = new Map<string, SeedSpot>();
    for (const match of sql.matchAll(pattern)) {
      spots.set(match[1], { citySlug: match[2], status: match[3], quietness: match[4], authorId: match[5] });
    }
    return spots;
  }

  it("街・状態・静けさ（spots.quietness）・投稿者が seed と同じ", async () => {
    const { FIXTURE_SPOTS } = await import("./fixtures");
    const { REAL_SHOPS } = await import("./fixtures-real-shops");
    const seed = readSeedSpots();
    // 最初の実在6店＋2026-10-06 に足した76軒（デモモード専用の架空3店は seed に入れない）
    expect(REAL_SHOPS).toHaveLength(76);
    expect(seed.size).toBe(6 + REAL_SHOPS.length);
    for (const [id, expected] of seed) {
      const spot = FIXTURE_SPOTS.find((candidate) => candidate.id === id);
      expect(spot, id).toBeDefined();
      expect(
        { citySlug: spot!.citySlug, status: spot!.status, quietness: spot!.quietness, authorId: spot!.authorId },
        id,
      ).toEqual(expected);
    }
  });

  it("追加した実在の店の店名・住所・座標・一言は seed と同じ", async () => {
    const { REAL_SHOPS } = await import("./fixtures-real-shops");
    // 作業コピーの改行が CRLF のこともある（core.autocrlf）ので LF にそろえて読む
    const sql = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8").replace(/\r\n/g, "\n");
    for (const shop of REAL_SHOPS) {
      const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
      const at = sql.indexOf(`'${shop.id}',\n  (select id from cities`);
      expect(at, shop.name).toBeGreaterThan(0);
      const block = sql.slice(at);
      const head = block.slice(0, 1200);
      expect(head, shop.name).toContain(quote(shop.name));
      expect(head, shop.name).toContain(quote(shop.address));
      expect(head, shop.name).toContain(quote(shop.reason));
      expect(head, shop.name).toContain(`ST_MakePoint(${shop.lng}, ${shop.lat})`);
    }
  });

  it("公開済みの店は、その街の住人2人以上の承認を持つ（承認の規則）", async () => {
    const { FIXTURE_SPOTS, FIXTURE_ENDORSEMENT_LOG, fixtureUserHomeCitySlug } = await import("./fixtures");
    for (const spot of FIXTURE_SPOTS.filter((s) => s.status === "published")) {
      const endorsers = FIXTURE_ENDORSEMENT_LOG.filter((e) => e.spotId === spot.id);
      expect(endorsers.length, spot.name).toBeGreaterThanOrEqual(2);
      for (const e of endorsers) {
        expect(e.userId, spot.name).not.toBe(spot.authorId);
        expect(fixtureUserHomeCitySlug(e.userId), spot.name).toBe(spot.citySlug);
      }
    }
  });

  it("投稿者は全員、投稿先の街の住人（create_spot の規則）", async () => {
    const { FIXTURE_SPOTS, fixtureUserHomeCitySlug } = await import("./fixtures");
    for (const spot of FIXTURE_SPOTS) {
      expect(fixtureUserHomeCitySlug(spot.authorId), spot.name).toBe(spot.citySlug);
    }
  });

  it("確認依頼の依頼先は、スポットの投稿者", async () => {
    const { FIXTURE_SPOTS, FIXTURE_VERIFICATION_REQUESTS } = await import("./fixtures");
    for (const request of FIXTURE_VERIFICATION_REQUESTS) {
      expect(FIXTURE_SPOTS.find((spot) => spot.id === request.spotId)?.authorId).toBe(request.userId);
    }
  });

  it("静けさの正本（spots.quietness）は、確認履歴の最新の回答と一致する", async () => {
    const { FIXTURE_SPOTS, FIXTURE_VERIFICATIONS } = await import("./fixtures");
    for (const spot of FIXTURE_SPOTS) {
      const history = FIXTURE_VERIFICATIONS.filter((v) => v.spotId === spot.id);
      expect(resolveQuietness(history, spot.quietness), spot.name).toBe(spot.quietness);
    }
  });
});

describe("居住街の変更とリセット", () => {
  it("setFixtureUserHomeCity で変わり、resetFixtureUserHomeCities で初期値に戻る", async () => {
    const { setFixtureUserHomeCity, resetFixtureUserHomeCities, fixtureUserHomeCitySlug } = await import("./fixtures");
    const demoUser = "b0000000-0000-4000-8000-000000000004";
    setFixtureUserHomeCity(demoUser, "a0000000-0000-4000-8000-000000000002");
    expect(fixtureUserHomeCitySlug(demoUser)).toBe("otaru");
    resetFixtureUserHomeCities();
    expect(fixtureUserHomeCitySlug(demoUser)).toBe("sapporo");
  });
});
