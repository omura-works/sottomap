// src/lib/db/spots.ts の Supabase 経路を、PostgREST の実際の応答形状で検証する。
// 応答の形は、ローカル Supabase（supabase start）に対して実際に取得したものに合わせてある:
//   GET /rest/v1/spot_tags?select=spot_id,tags(id,slug,label,kind)
//   → [{"spot_id":"d0…01","tags":{"id":"e0…01","kind":"accent2","slug":"fish-shop-direct","label":"魚屋直営"}}, …]
//   spot_tags → tags は多対一なので、tags は配列ではなく単一オブジェクト（読めなければ null）。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { City } from "./types";
import type { CityRow, SpotRelatedRows, SpotRow } from "./spots";

// ---------------------------------------------------------
// PostgREST の問い合わせを記録し、テーブルごとの応答を返す偽クライアント
// ---------------------------------------------------------
type Result = { data: unknown; error: { message: string } | null; count?: number | null };

interface Call {
  table: string;
  ops: Array<[string, unknown[]]>;
}

const state: {
  calls: Call[];
  responses: Record<string, (call: Call) => Result>;
  signedIn: boolean;
} = { calls: [], responses: {}, signedIn: true };

function makeBuilder(table: string) {
  const call: Call = { table, ops: [] };
  state.calls.push(call);
  const resolve = (): Result => {
    const handler = state.responses[table];
    if (!handler) throw new Error(`unexpected table: ${table}`);
    return handler(call);
  };
  const builder: Record<string, unknown> = {};
  for (const op of ["select", "eq", "in", "or", "gte", "order", "limit"]) {
    builder[op] = (...args: unknown[]) => {
      call.ops.push([op, args]);
      return builder;
    };
  }
  builder.maybeSingle = () => {
    call.ops.push(["maybeSingle", []]);
    const result = resolve();
    const rows = Array.isArray(result.data) ? result.data : [];
    return Promise.resolve({ ...result, data: result.error ? null : (rows[0] ?? null) });
  };
  builder.then = (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve().then(resolve).then(onFulfilled, onRejected);
  return builder;
}

vi.mock("../supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => makeBuilder(table),
    auth: {
      getSession: async () => ({
        data: { session: state.signedIn ? { access_token: "token" } : null },
        error: null,
      }),
    },
  }),
  createServiceRoleClient: () => {
    throw new Error("not used");
  },
}));

vi.mock("../supabase/env", () => ({
  isSupabaseConfigured: () => true,
}));

function opArgs(call: Call, op: string): unknown[][] {
  return call.ops.filter(([name]) => name === op).map(([, args]) => args);
}

/** eq / in / gte の条件だけを見て、行を絞り込む（テスト用の簡易 PostgREST）。 */
function filterRows<T extends Record<string, unknown>>(rows: T[], call: Call): T[] {
  return rows.filter((row) =>
    call.ops.every(([op, args]) => {
      const [column, value] = args as [string, unknown];
      if (op === "eq") return column.includes(".") || row[column] === value;
      if (op === "in") return column.includes(".") || (value as unknown[]).includes(row[column]);
      if (op === "gte") return String(row[column]) >= String(value);
      return true;
    }),
  );
}

// ---------------------------------------------------------
// seed.sql 相当の行（実DBの列名・形）
// ---------------------------------------------------------
const SAPPORO: CityRow = {
  id: "a0000000-0000-4000-8000-000000000001",
  slug: "sapporo",
  name: "札幌",
  name_kana: "さっぽろ",
  is_port: false,
  center_lat: 43.0621,
  center_lng: 141.3544,
  default_zoom: 12.5,
  featured_area: "北24条",
};

function spotRow(overrides: Partial<SpotRow> & Pick<SpotRow, "id" | "name">): SpotRow {
  return {
    city_id: SAPPORO.id,
    address: null,
    area_name: null,
    category: null,
    lat: 43.0621,
    lng: 141.3544,
    status: "published",
    quietness: "quiet",
    reason: "理由",
    hover_description: null,
    visit_frequency: "weekly",
    author_id: "b0000000-0000-4000-8000-000000000001",
    photo_url: null,
    published_at: "2026-01-01T00:00:00+00:00",
    next_verification_at: "2026-12-01T00:00:00+00:00",
    last_verified_at: "2026-09-10T00:00:00+00:00",
    created_at: "2025-12-01T00:00:00+00:00",
    ...overrides,
  };
}

const SHIHACHI = spotRow({
  id: "d0000000-0000-4000-8000-000000000001",
  name: "シハチ鮮魚店 北24条店",
  area_name: "北24条",
  lat: 43.0847,
  lng: 141.3486,
});
const ZANGI = spotRow({
  id: "d0000000-0000-4000-8000-000000000002",
  name: "札幌ザンギ本舗",
  area_name: "すすきの",
  lat: 43.0552,
  lng: 141.354,
  author_id: "b0000000-0000-4000-8000-000000000002",
});
const KIFU = spotRow({
  id: "d0000000-0000-4000-8000-000000000003",
  name: "札幌らーめん輝風 すすきの店",
  area_name: "すすきの",
  lat: 43.0562,
  lng: 141.3534,
  quietness: "crowding",
  author_id: "b0000000-0000-4000-8000-000000000003",
});
const SPOTS = [SHIHACHI, ZANGI, KIFU];

const TAG_LINKS = [
  { spot_id: SHIHACHI.id, tags: { id: "e0000000-0000-4000-8000-000000000001", kind: "accent2", slug: "fish-shop-direct", label: "魚屋直営" } },
  { spot_id: SHIHACHI.id, tags: { id: "e0000000-0000-4000-8000-000000000009", kind: "neutral", slug: "day-time-main", label: "昼が本番" } },
  { spot_id: ZANGI.id, tags: { id: "e0000000-0000-4000-8000-000000000002", kind: "neutral", slug: "takeout-ok", label: "持ち帰りもできる" } },
  { spot_id: KIFU.id, tags: null },
];

// 確認履歴は、spots.quietness と食い違う（最新が quiet）ようにしてある。表示は spots.quietness が正本。
const VERIFICATIONS = [
  { spot_id: KIFU.id, user_id: "u1", created_at: "2026-09-10T00:00:00+00:00" },
  { spot_id: KIFU.id, user_id: "u2", created_at: "2026-09-10T01:00:00+00:00" },
  { spot_id: SHIHACHI.id, user_id: "u1", created_at: "2026-09-10T00:00:00+00:00" },
];

function installDefaultResponses(): void {
  state.responses = {
    cities: (call) => ({ data: filterRows([SAPPORO] as unknown as Array<Record<string, unknown>>, call), error: null }),
    spots: (call) => ({ data: filterRows(SPOTS as unknown as Array<Record<string, unknown>>, call), error: null }),
    spot_tags: (call) => {
      const slugFilter = opArgs(call, "in").find(([column]) => column === "tags.slug");
      let rows = filterRows(TAG_LINKS as unknown as Array<Record<string, unknown>>, call);
      if (slugFilter) {
        const slugs = slugFilter[1] as string[];
        rows = rows.filter((row) => {
          const tag = row.tags as { slug: string } | null;
          return tag !== null && slugs.includes(tag.slug);
        });
      }
      return { data: rows, error: null };
    },
    verifications: (call) => ({ data: filterRows(VERIFICATIONS, call), error: null }),
    endorsements: (call) => ({
      data: filterRows([{ spot_id: SHIHACHI.id }, { spot_id: SHIHACHI.id }, { spot_id: ZANGI.id }], call),
      error: null,
    }),
    public_profiles: (call) => ({
      data: filterRows(
        [
          { id: "b0000000-0000-4000-8000-000000000001", display_name: "Kさん", area_name: "北24条", resident_years: 14 },
          { id: "b0000000-0000-4000-8000-000000000002", display_name: "Mさん", area_name: "すすきの", resident_years: 8 },
          { id: "b0000000-0000-4000-8000-000000000003", display_name: "Tさん", area_name: "すすきの", resident_years: 5 },
        ],
        call,
      ),
      error: null,
    }),
    verification_requests: (call) => ({
      data: filterRows([{ id: "req-1", spot_id: SHIHACHI.id, status: "open" }], call),
      error: null,
    }),
    bookmarks: () => ({
      data: [
        { id: "bm-1", user_id: "me", spot_id: KIFU.id, planned_at: null, meta: null, created_at: "2026-09-02T00:00:00+00:00" },
        { id: "bm-2", user_id: "me", spot_id: SHIHACHI.id, planned_at: null, meta: "メタ", created_at: "2026-09-01T00:00:00+00:00" },
        { id: "bm-3", user_id: "me", spot_id: "hidden-spot", planned_at: null, meta: null, created_at: "2026-08-01T00:00:00+00:00" },
      ],
      error: null,
    }),
  };
}

beforeEach(() => {
  state.calls = [];
  state.signedIn = true;
  installDefaultResponses();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assembleSpots（PostgREST の応答形状からの組み立て）", () => {
  const city: City = {
    id: SAPPORO.id,
    slug: "sapporo",
    name: "札幌",
    nameKana: "さっぽろ",
    isPort: false,
    centerLat: 43.0621,
    centerLng: 141.3544,
    defaultZoom: 12.5,
    featuredArea: "北24条",
  };

  it("tags を単一オブジェクトとして扱い、null の行は飛ばす", async () => {
    const { assembleSpots } = await import("./spots");
    const related = {
      tagLinks: TAG_LINKS,
      verifications: VERIFICATIONS,
      endorsements: [],
      authors: [],
      openRequests: [],
    } as unknown as SpotRelatedRows;
    const spots = assembleSpots(SPOTS, related, new Map([[city.id, city]]));
    expect(spots.map((s) => s.tags.map((t) => t.label))).toEqual([["魚屋直営", "昼が本番"], ["持ち帰りもできる"], []]);
    expect(spots[0].tags[0]).toEqual({ id: "e0000000-0000-4000-8000-000000000001", slug: "fish-shop-direct", label: "魚屋直営", kind: "accent2" });
  });

  it("静けさは spots.quietness を正本にする（確認履歴からは求め直さない）", async () => {
    const { assembleSpots } = await import("./spots");
    const related: SpotRelatedRows = { tagLinks: [], verifications: VERIFICATIONS, endorsements: [], authors: [], openRequests: [] };
    const [, , kifu] = assembleSpots(SPOTS, related, new Map([[city.id, city]]));
    expect(kifu.quietness).toBe("crowding");
    expect(kifu.verifierCount).toBe(2);
  });

  it("街が読めない行は例外にする（空の街名で表示しない）", async () => {
    const { assembleSpots } = await import("./spots");
    const related: SpotRelatedRows = { tagLinks: [], verifications: [], endorsements: [], authors: [], openRequests: [] };
    expect(() => assembleSpots(SPOTS, related, new Map())).toThrow("スポットの街の取得に失敗しました");
  });
});

describe("buildIlikeOrFilter（PostgREST の or フィルター用のエスケープ）", () => {
  it("地域名を含む4列を対象にする", async () => {
    const { buildIlikeOrFilter } = await import("./spots");
    expect(buildIlikeOrFilter("色内")).toBe(
      'name.ilike."%色内%",reason.ilike."%色内%",category.ilike."%色内%",area_name.ilike."%色内%"',
    );
  });

  it("区切り文字・引用符・LIKE の特殊文字を打ち消す（ローカル Supabase で確認した形）", async () => {
    const { buildIlikeOrFilter } = await import("./spots");
    expect(buildIlikeOrFilter('a,b)."c', ["name"])).toBe('name.ilike."%a,b).\\"c%"');
    expect(buildIlikeOrFilter("100%", ["name"])).toBe('name.ilike."%100\\\\%%"');
    expect(buildIlikeOrFilter("a_b*c\\d", ["name"])).toBe('name.ilike."%a\\\\_b\\\\*c\\\\\\\\d%"');
  });
});

describe("listSpots（Supabase 経路）", () => {
  it("タグ付きスポットを例外なく読み、§9.5 の順で返す", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "sapporo" });
    expect(spots.map((s) => s.name)).toEqual(["札幌ザンギ本舗", "シハチ鮮魚店 北24条店", "札幌らーめん輝風 すすきの店"]);
    expect(spots[1]).toMatchObject({
      authorLabel: "北24条に14年、Kさん",
      endorsementCount: 2,
      openRequestId: "req-1",
      verifierCount: 1,
    });
    expect(spots[1].tags.map((t) => t.slug)).toEqual(["fish-shop-direct", "day-time-main"]);
  });

  it("検索語は trim し、エスケープした or フィルター（地域名を含む）で DB に渡す", async () => {
    const { listSpots } = await import("./spots");
    await listSpots({ citySlug: "sapporo", q: "  北24 " });
    const spotsCall = state.calls.find((call) => call.table === "spots");
    expect(opArgs(spotsCall!, "or")).toEqual([
      ['name.ilike."%北24%",reason.ilike."%北24%",category.ilike."%北24%",area_name.ilike."%北24%"'],
    ]);
  });

  it("limit は関連データの取得前に適用し、関連クエリは表示する行の分だけ（1種類1回）", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "sapporo", limit: 1 });
    expect(spots.map((s) => s.name)).toEqual(["札幌ザンギ本舗"]);
    for (const table of ["spot_tags", "verifications", "endorsements", "verification_requests"]) {
      const calls = state.calls.filter((call) => call.table === table);
      expect(calls, table).toHaveLength(1);
      expect(opArgs(calls[0], "in")[0]).toEqual(["spot_id", [ZANGI.id]]);
    }
  });

  it("タグのフィルターは DB でタグを引いて絞る（AND 条件）", async () => {
    const { listSpots } = await import("./spots");
    const spots = await listSpots({ citySlug: "sapporo", filters: ["fish-shop-direct", "day-time-main"] });
    expect(spots.map((s) => s.name)).toEqual(["シハチ鮮魚店 北24条店"]);
    expect(await listSpots({ citySlug: "sapporo", filters: ["fish-shop-direct", "takeout-ok"] })).toEqual([]);
  });

  it("未ログインでは確認依頼を問い合わせない（anon には表の権限が無い。0006）", async () => {
    const { listSpots } = await import("./spots");
    state.signedIn = false;
    state.responses.verification_requests = () => ({ data: null, error: { message: "permission denied for table verification_requests" } });
    const spots = await listSpots({ citySlug: "sapporo" });
    expect(spots.every((s) => s.openRequestId === null)).toBe(true);
    expect(state.calls.filter((call) => call.table === "verification_requests")).toHaveLength(0);
  });

  it.each(["spot_tags", "verifications", "endorsements", "public_profiles", "verification_requests"])(
    "関連クエリ（%s）の失敗は空データにせず例外にする",
    async (table) => {
      const { listSpots } = await import("./spots");
      state.responses[table] = () => ({ data: null, error: { message: "permission denied" } });
      await expect(listSpots({ citySlug: "sapporo" })).rejects.toThrow("permission denied");
    },
  );
});

describe("getSpot（Supabase 経路）", () => {
  it("街の取得に失敗したら例外にする（空の街名・slug で表示しない）", async () => {
    const { getSpot } = await import("./spots");
    state.responses.cities = () => ({ data: null, error: { message: "boom" } });
    await expect(getSpot(SHIHACHI.id)).rejects.toThrow("街の取得に失敗しました: boom");
  });

  it("街が読めない（0件）ときも例外にする", async () => {
    const { getSpot } = await import("./spots");
    state.responses.cities = () => ({ data: [], error: null });
    await expect(getSpot(SHIHACHI.id)).rejects.toThrow("スポットの街の取得に失敗しました");
  });

  it("タグ付きスポットを1件読める", async () => {
    const { getSpot } = await import("./spots");
    const spot = await getSpot(SHIHACHI.id);
    expect(spot?.citySlug).toBe("sapporo");
    expect(spot?.tags.map((t) => t.label)).toEqual(["魚屋直営", "昼が本番"]);
  });
});

describe("listBookmarks（Supabase 経路）", () => {
  it("スポットをまとめて1回で取得し、栞の順序を保つ。読めないスポットの栞は外す", async () => {
    const { listBookmarks } = await import("./spots");
    const bookmarks = await listBookmarks("me");
    expect(bookmarks.map((b) => [b.id, b.spot.name])).toEqual([
      ["bm-1", "札幌らーめん輝風 すすきの店"],
      ["bm-2", "シハチ鮮魚店 北24条店"],
    ]);
    expect(state.calls.filter((call) => call.table === "spots")).toHaveLength(1);
    expect(state.calls.filter((call) => call.table === "cities")).toHaveLength(1);
    expect(state.calls.filter((call) => call.table === "spot_tags")).toHaveLength(1);
  });
});
