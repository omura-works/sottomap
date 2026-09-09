// データアクセス層（docs/CONTRACT.md `src/lib/db/spots.ts`）
//
// Supabase の実インスタンスが未接続の環境（NEXT_PUBLIC_SUPABASE_URL /
// NEXT_PUBLIC_SUPABASE_ANON_KEY が無い）では、supabase/seed.sql 相当の
// インメモリ・フィクスチャ（./fixtures.ts）へ自動フォールバックする。
// 呼び出し側（T3〜T5）は分岐を意識する必要はなく、常に同じシグネチャで使える。
//
// 一覧を返す経路は必ず sortSpots（domain/ordering.ts）を通す。

import { sortSpots } from "../domain/ordering";
import { resolveQuietness } from "../domain/quietness";
import { isSupabaseConfigured } from "../supabase/env";
import { createClient } from "../supabase/server";
import {
  FIXTURE_BOOKMARKS,
  FIXTURE_CITIES,
  FIXTURE_SPOTS,
  FIXTURE_VERIFICATIONS,
  fixtureUserHomeCitySlug,
} from "./fixtures";
import type { Bookmark, City, Quietness, Spot, Tag, TagKind, Verification, VisitFrequency } from "./types";

export interface SpotQuery {
  citySlug: string;
  q?: string; // 検索語
  filters?: string[]; // タグ slug: 'quiet-now' | 'day-only' | 'cash-only' | 'solo-ok' | 'within-10min'
  origin?: { lat: number; lng: number };
  limit?: number;
}

function fallbackLog(fnName: string): void {
  // Supabase 未接続時のフォールバック動作であることが分かるようにログを残す。
  console.debug(`[urasupo/db] ${fnName}: Supabase 未接続のためフィクスチャ（seed.sql相当）を使用します。`);
}

// =========================================================
// 検索語・タグフィルタ・距離ソートの共通ロジック
// （Supabase 経路・フィクスチャ経路の両方から使う）
// =========================================================

const EARTH_RADIUS_M = 6371000;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 徒歩10分の目安距離（分速80m換算）。'within-10min' フィルタに使う。 */
const WITHIN_10MIN_METERS = 800;

function matchesFilter(spot: Spot, filter: string, origin?: { lat: number; lng: number }): boolean {
  switch (filter) {
    case "quiet-now":
      return spot.quietness === "quiet";
    case "within-10min":
      if (!origin) return true; // 現在地が無ければ絞り込みをスキップ
      return haversineMeters(origin, { lat: spot.lat, lng: spot.lng }) <= WITHIN_10MIN_METERS;
    default:
      // day-only / cash-only / solo-ok 等のタグ slug
      return spot.tags.some((tag) => tag.slug === filter);
  }
}

function matchesQuery(spot: Spot, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (needle === "") return true;
  const haystack = [spot.name, spot.reason, spot.category ?? "", spot.areaName ?? ""]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function applySpotQuery(spots: Spot[], query: SpotQuery): Spot[] {
  let result = spots;

  if (query.q) {
    result = result.filter((spot) => matchesQuery(spot, query.q as string));
  }
  if (query.filters && query.filters.length > 0) {
    result = result.filter((spot) => query.filters!.every((f) => matchesFilter(spot, f, query.origin)));
  }

  const distances = query.origin
    ? Object.fromEntries(
        result.map((spot) => [spot.id, haversineMeters(query.origin as { lat: number; lng: number }, { lat: spot.lat, lng: spot.lng })]),
      )
    : undefined;

  const sorted = sortSpots(result, distances);
  return query.limit ? sorted.slice(0, query.limit) : sorted;
}

/** 直近の確認「回」に参加した人数（同じ最新日から24時間以内に記録された確認の人数）。 */
function computeVerifierCount(verifications: Verification[]): number {
  if (verifications.length === 0) return 0;
  const latest = Math.max(...verifications.map((v) => new Date(v.createdAt).getTime()));
  const dayMs = 24 * 60 * 60 * 1000;
  const uniqueUsers = new Set(
    verifications.filter((v) => latest - new Date(v.createdAt).getTime() < dayMs).map((v) => v.userId),
  );
  return uniqueUsers.size;
}

// =========================================================
// Supabase 実データ経路（行 → ドメイン型のマッピング）
// =========================================================

interface CityRow {
  id: string;
  slug: string;
  name: string;
  name_kana: string;
  is_port: boolean;
  center_lat: number;
  center_lng: number;
  default_zoom: number;
}

function mapCityRow(row: CityRow): City {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameKana: row.name_kana,
    isPort: row.is_port,
    centerLat: row.center_lat,
    centerLng: row.center_lng,
    defaultZoom: row.default_zoom,
  };
}

interface TagRow {
  id: string;
  slug: string;
  label: string;
  kind: TagKind;
}

function mapTagRow(row: TagRow): Tag {
  return { id: row.id, slug: row.slug, label: row.label, kind: row.kind };
}

interface VerificationRow {
  id: string;
  spot_id: string;
  user_id: string;
  answer: Quietness;
  note: string | null;
  created_at: string;
}

function mapVerificationRow(row: VerificationRow): Verification {
  return {
    id: row.id,
    spotId: row.spot_id,
    userId: row.user_id,
    answer: row.answer,
    note: row.note,
    createdAt: row.created_at,
  };
}

interface SpotRow {
  id: string;
  city_id: string;
  name: string;
  address: string | null;
  area_name: string | null;
  category: string | null;
  lat: number;
  lng: number;
  status: Spot["status"];
  quietness: Quietness;
  reason: string;
  visit_frequency: VisitFrequency;
  author_id: string;
  photo_url: string | null;
  published_at: string | null;
  next_verification_at: string | null;
  last_verified_at: string | null;
  created_at: string;
}

/** spots 行 + 関連データ（city / author / tags / verifications / endorsement数）からドメインの Spot を組み立てる。 */
function mapSpotRow(
  row: SpotRow,
  ctx: {
    city: City;
    author: { displayName: string; areaName: string | null; residentYears: number | null } | null;
    tags: Tag[];
    verifications: Verification[];
    endorsementCount: number;
  },
): Spot {
  return {
    id: row.id,
    cityId: row.city_id,
    citySlug: ctx.city.slug,
    cityName: ctx.city.name,
    name: row.name,
    areaName: row.area_name,
    address: row.address,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
    status: row.status,
    quietness: resolveQuietness(ctx.verifications, row.quietness),
    reason: row.reason,
    visitFrequency: row.visit_frequency,
    authorId: row.author_id,
    authorLabel: ctx.author
      ? `${ctx.author.areaName ?? ""}に${ctx.author.residentYears ?? "?"}年、${ctx.author.displayName}`
      : null,
    photoUrl: row.photo_url,
    tags: ctx.tags,
    endorsementCount: ctx.endorsementCount,
    verifierCount: computeVerifierCount(ctx.verifications),
    lastVerifiedAt: row.last_verified_at,
    nextVerificationAt: row.next_verification_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

/**
 * 複数の spots 行を、関連する tags / verifications / endorsements / author をまとめて取得したうえで
 * ドメインの Spot[] に組み立てる。listSpots / getSpot / listPendingSpots / listRecentlyVerified が使う。
 */
async function hydrateSpotRows(rows: SpotRow[], city: City): Promise<Spot[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const spotIds = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.author_id))];

  const [{ data: tagLinks }, { data: verificationRows }, { data: endorsementRows }, { data: authorRows }] =
    await Promise.all([
      supabase.from("spot_tags").select("spot_id, tags(id, slug, label, kind)").in("spot_id", spotIds),
      supabase.from("verifications").select("*").in("spot_id", spotIds),
      supabase.from("endorsements").select("spot_id").in("spot_id", spotIds),
      supabase.from("users").select("id, display_name, area_name, resident_years").in("id", authorIds),
    ]);

  const tagsBySpot = new Map<string, Tag[]>();
  for (const link of (tagLinks ?? []) as Array<{ spot_id: string; tags: TagRow[] }>) {
    const list = tagsBySpot.get(link.spot_id) ?? [];
    for (const tagRow of link.tags) {
      list.push(mapTagRow(tagRow));
    }
    tagsBySpot.set(link.spot_id, list);
  }

  const verificationsBySpot = new Map<string, Verification[]>();
  for (const row of (verificationRows ?? []) as VerificationRow[]) {
    const v = mapVerificationRow(row);
    const list = verificationsBySpot.get(v.spotId) ?? [];
    list.push(v);
    verificationsBySpot.set(v.spotId, list);
  }

  const endorsementCountBySpot = new Map<string, number>();
  for (const row of (endorsementRows ?? []) as Array<{ spot_id: string }>) {
    endorsementCountBySpot.set(row.spot_id, (endorsementCountBySpot.get(row.spot_id) ?? 0) + 1);
  }

  const authorsById = new Map<string, { displayName: string; areaName: string | null; residentYears: number | null }>();
  for (const row of (authorRows ?? []) as Array<{ id: string; display_name: string; area_name: string | null; resident_years: number | null }>) {
    authorsById.set(row.id, { displayName: row.display_name, areaName: row.area_name, residentYears: row.resident_years });
  }

  return rows.map((row) =>
    mapSpotRow(row, {
      city,
      author: authorsById.get(row.author_id) ?? null,
      tags: tagsBySpot.get(row.id) ?? [],
      verifications: verificationsBySpot.get(row.id) ?? [],
      endorsementCount: endorsementCountBySpot.get(row.id) ?? 0,
    }),
  );
}

// =========================================================
// 公開関数（CONTRACT のシグネチャ）
// =========================================================

export async function listCities(): Promise<City[]> {
  if (!isSupabaseConfigured()) {
    fallbackLog("listCities");
    return FIXTURE_CITIES;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("cities").select("*").order("name");
  if (error) throw error;
  return ((data ?? []) as CityRow[]).map(mapCityRow);
}

export async function getCity(slug: string): Promise<City | null> {
  if (!isSupabaseConfigured()) {
    fallbackLog("getCity");
    return FIXTURE_CITIES.find((c) => c.slug === slug) ?? null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("cities").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data ? mapCityRow(data as CityRow) : null;
}

/** 必ず sortSpots を通して返す。status='published' のみ。 */
export async function listSpots(query: SpotQuery): Promise<Spot[]> {
  if (!isSupabaseConfigured()) {
    fallbackLog("listSpots");
    const published = FIXTURE_SPOTS.filter((s) => s.citySlug === query.citySlug && s.status === "published");
    return applySpotQuery(published, query);
  }

  const city = await getCity(query.citySlug);
  if (!city) return [];

  const supabase = await createClient();
  let builder = supabase.from("spots").select("*").eq("city_id", city.id).eq("status", "published");
  if (query.q) {
    const like = `%${query.q}%`;
    builder = builder.or(`name.ilike.${like},reason.ilike.${like},category.ilike.${like}`);
  }
  const { data, error } = await builder;
  if (error) throw error;

  const spots = await hydrateSpotRows((data ?? []) as SpotRow[], city);
  return applySpotQuery(spots, { ...query, q: undefined }); // q は既に SQL 側で絞り込み済み
}

export async function getSpot(id: string): Promise<Spot | null> {
  if (!isSupabaseConfigured()) {
    fallbackLog("getSpot");
    return FIXTURE_SPOTS.find((s) => s.id === id) ?? null;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("spots").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as SpotRow;
  const city = await getCity((await supabase.from("cities").select("slug").eq("id", row.city_id).maybeSingle()).data?.slug ?? "");
  const cityResolved = city ?? { id: row.city_id, slug: "", name: "", nameKana: "", isPort: false, centerLat: 0, centerLng: 0, defaultZoom: 13 };
  const [spot] = await hydrateSpotRows([row], cityResolved);
  return spot ?? null;
}

export async function listVerifications(spotId: string): Promise<Verification[]> {
  if (!isSupabaseConfigured()) {
    fallbackLog("listVerifications");
    return FIXTURE_VERIFICATIONS.filter((v) => v.spotId === spotId).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("verifications")
    .select("*")
    .eq("spot_id", spotId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as VerificationRow[]).map(mapVerificationRow);
}

/** 承認待ち（同じ街のユーザーにだけ見せる） */
export async function listPendingSpots(citySlug: string, viewerId: string): Promise<Spot[]> {
  if (!isSupabaseConfigured()) {
    fallbackLog("listPendingSpots");
    // フィクスチャには pending のスポットを用意していない（実在6店は全て published）ため、
    // 常に空配列になる。挙動としては正しい（同じ街のユーザーに見せる承認待ち一覧が無い状態）。
    const viewerHomeCitySlug = fixtureUserHomeCitySlug(viewerId);
    const pending = FIXTURE_SPOTS.filter(
      (s) =>
        s.citySlug === citySlug &&
        s.status === "pending" &&
        (s.authorId === viewerId || viewerHomeCitySlug === citySlug),
    );
    return sortSpots(pending);
  }

  const city = await getCity(citySlug);
  if (!city) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spots")
    .select("*")
    .eq("city_id", city.id)
    .eq("status", "pending");
  if (error) throw error;
  const spots = await hydrateSpotRows((data ?? []) as SpotRow[], city);
  return sortSpots(spots);
}

export async function listBookmarks(userId: string): Promise<Bookmark[]> {
  if (!isSupabaseConfigured()) {
    fallbackLog("listBookmarks");
    return FIXTURE_BOOKMARKS.filter((b) => b.userId === userId);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Array<{ id: string; user_id: string; spot_id: string; planned_at: string | null; created_at: string }>;
  const bookmarks: Bookmark[] = [];
  for (const row of rows) {
    const spot = await getSpot(row.spot_id);
    if (!spot) continue;
    bookmarks.push({
      id: row.id,
      userId: row.user_id,
      spotId: row.spot_id,
      plannedAt: row.planned_at,
      createdAt: row.created_at,
      spot,
    });
  }
  return bookmarks;
}

export async function countPublishedSpots(citySlug: string): Promise<number> {
  if (!isSupabaseConfigured()) {
    fallbackLog("countPublishedSpots");
    return FIXTURE_SPOTS.filter((s) => s.citySlug === citySlug && s.status === "published").length;
  }
  const city = await getCity(citySlug);
  if (!city) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("spots")
    .select("id", { count: "exact", head: true })
    .eq("city_id", city.id)
    .eq("status", "published");
  if (error) throw error;
  return count ?? 0;
}

export async function countQuietSpots(citySlug: string, areaName?: string): Promise<number> {
  if (!isSupabaseConfigured()) {
    fallbackLog("countQuietSpots");
    return FIXTURE_SPOTS.filter(
      (s) =>
        s.citySlug === citySlug &&
        s.status === "published" &&
        s.quietness === "quiet" &&
        (areaName ? s.areaName === areaName : true),
    ).length;
  }
  const city = await getCity(citySlug);
  if (!city) return 0;
  const spots = await listSpots({ citySlug, filters: ["quiet-now"] });
  return spots.filter((s) => (areaName ? s.areaName === areaName : true)).length;
}

/** 「今週、静けさが確認された店」— 直近7日に確認があった店を確認人数つきで */
export async function listRecentlyVerified(
  citySlug: string,
  limit?: number,
): Promise<Array<{ spot: Spot; verifierCount: number }>> {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  if (!isSupabaseConfigured()) {
    fallbackLog("listRecentlyVerified");
    const spotIdsWithRecentVerification = new Set(
      FIXTURE_VERIFICATIONS.filter((v) => new Date(v.createdAt).getTime() >= sevenDaysAgo).map((v) => v.spotId),
    );
    const spots = FIXTURE_SPOTS.filter(
      (s) => s.citySlug === citySlug && s.status === "published" && spotIdsWithRecentVerification.has(s.id),
    );
    const sorted = sortSpots(spots);
    const limited = limit ? sorted.slice(0, limit) : sorted;
    return limited.map((spot) => ({ spot, verifierCount: spot.verifierCount }));
  }

  const spots = await listSpots({ citySlug });
  const recentlyVerified = spots.filter(
    (s) => s.lastVerifiedAt && new Date(s.lastVerifiedAt).getTime() >= sevenDaysAgo,
  );
  const limited = limit ? recentlyVerified.slice(0, limit) : recentlyVerified;
  return limited.map((spot) => ({ spot, verifierCount: spot.verifierCount }));
}
