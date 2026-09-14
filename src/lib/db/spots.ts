// データアクセス層（docs/CONTRACT.md `src/lib/db/spots.ts` + 追補 2026-09-09）
//
// Supabase の実インスタンスが未接続の環境（NEXT_PUBLIC_SUPABASE_URL /
// NEXT_PUBLIC_SUPABASE_ANON_KEY が無い）では、supabase/seed.sql 相当の
// インメモリ・フィクスチャ（./fixtures.ts）へ自動フォールバックする。
// 呼び出し側（T3〜T5）は分岐を意識する必要はなく、常に同じシグネチャで使える。
//
// 一覧を返す経路は必ず sortSpots（domain/ordering.ts）を通す。
// distanceMeters/walkMinutes は、呼び出し元が origin を渡せない経路も含め、
// 「origin があればそこから、無ければ街の中心から」常に埋める（CONTRACT追補）。

import { sortSpots } from "../domain/ordering";
import { resolveQuietness } from "../domain/quietness";
import { isSupabaseConfigured } from "../supabase/env";
import { createClient } from "../supabase/server";
import {
  FIXTURE_BOOKMARKS,
  FIXTURE_CITIES,
  FIXTURE_SPOTS,
  FIXTURE_VERIFICATIONS,
  FIXTURE_VERIFICATION_REQUESTS,
  findFixtureSpot,
  findFixtureVerificationRequest,
  fixtureCityById,
  fixtureProfileStats,
  fixtureSpotsByAuthor,
  fixtureUserHomeCitySlug,
  fixtureUserProfile,
} from "./fixtures";
import type {
  Bookmark,
  City,
  Quietness,
  RequestStatus,
  Spot,
  Tag,
  TagKind,
  UserProfile,
  VerificationRequest,
  Verification,
  VisitFrequency,
} from "./types";

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
// 検索語・タグフィルタ・距離ソート・距離/徒歩分の共通ロジック
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
/** 「徒歩7分」表示用の換算（CONTRACT追補: 80m/分）。 */
const WALK_METERS_PER_MINUTE = 80;

function computeWalkMinutes(meters: number): number {
  return Math.max(1, Math.ceil(meters / WALK_METERS_PER_MINUTE));
}

/**
 * origin（無ければ街の中心）からの distanceMeters/walkMinutes を1件の Spot に埋める。
 * CONTRACT追補: 「listSpots に origin があれば距離と徒歩分を埋める。無ければ街の中心から算出。」
 * を listSpots に限らず、Spot を返す全経路で一貫して適用する。
 */
function withDistance(spot: Spot, origin: { lat: number; lng: number }): Spot {
  const meters = haversineMeters(origin, { lat: spot.lat, lng: spot.lng });
  return { ...spot, distanceMeters: meters, walkMinutes: computeWalkMinutes(meters) };
}

function withDistances(spots: Spot[], origin: { lat: number; lng: number }): Spot[] {
  return spots.map((s) => withDistance(s, origin));
}

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

/** listSpots の絞り込み・並び替え・距離/徒歩分の付与・件数上限をまとめて適用する。 */
function applySpotQuery(spots: Spot[], query: SpotQuery, cityCenter: { lat: number; lng: number }): Spot[] {
  let result = spots;

  if (query.q) {
    result = result.filter((spot) => matchesQuery(spot, query.q as string));
  }
  if (query.filters && query.filters.length > 0) {
    result = result.filter((spot) => query.filters!.every((f) => matchesFilter(spot, f, query.origin)));
  }

  const origin = query.origin ?? cityCenter;
  const distances = Object.fromEntries(
    result.map((spot) => [spot.id, haversineMeters(origin, { lat: spot.lat, lng: spot.lng })]),
  );

  const sorted = sortSpots(result, distances);
  const limited = query.limit ? sorted.slice(0, query.limit) : sorted;
  return withDistances(limited, origin);
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
  featured_area: string | null;
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
    featuredArea: row.featured_area,
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

interface VerificationRequestRow {
  id: string;
  spot_id: string;
  user_id: string;
  due_at: string;
  status: RequestStatus;
  answered_verification_id: string | null;
  created_at: string;
}

function mapVerificationRequestRow(row: VerificationRequestRow): VerificationRequest {
  return {
    id: row.id,
    spotId: row.spot_id,
    userId: row.user_id,
    dueAt: row.due_at,
    status: row.status,
    answeredVerificationId: row.answered_verification_id,
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
  hover_description: string | null;
  visit_frequency: VisitFrequency;
  author_id: string;
  photo_url: string | null;
  published_at: string | null;
  next_verification_at: string | null;
  last_verified_at: string | null;
  created_at: string;
}

/** spots 行 + 関連データ（city / author / tags / verifications / endorsement数 / open依頼）からドメインの Spot を組み立てる。 */
function mapSpotRow(
  row: SpotRow,
  ctx: {
    city: City;
    author: { displayName: string; areaName: string | null; residentYears: number | null } | null;
    tags: Tag[];
    verifications: Verification[];
    endorsementCount: number;
    openRequestId: string | null;
    origin: { lat: number; lng: number };
  },
): Spot {
  const distanceMeters = haversineMeters(ctx.origin, { lat: row.lat, lng: row.lng });
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
    hoverDescription: row.hover_description,
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
    distanceMeters,
    walkMinutes: computeWalkMinutes(distanceMeters),
    openRequestId: ctx.openRequestId,
  };
}

/**
 * 複数の spots 行を、関連する tags / verifications / endorsements / author / open な確認依頼を
 * まとめて取得したうえでドメインの Spot[] に組み立てる。
 * origin を渡さない場合は city の中心座標を使う（CONTRACT追補）。
 */
async function hydrateSpotRows(rows: SpotRow[], city: City, origin?: { lat: number; lng: number }): Promise<Spot[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const spotIds = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const effectiveOrigin = origin ?? { lat: city.centerLat, lng: city.centerLng };

  const [{ data: tagLinks }, { data: verificationRows }, { data: endorsementRows }, { data: authorRows }, { data: openRequestRows }] =
    await Promise.all([
      supabase.from("spot_tags").select("spot_id, tags(id, slug, label, kind)").in("spot_id", spotIds),
      supabase.from("verifications").select("*").in("spot_id", spotIds),
      supabase.from("endorsements").select("spot_id").in("spot_id", spotIds),
      // Spec §9.13.6: users の全列は本人しか読めない。投稿者クレジットは表示用の列だけを出すビュー経由。
      supabase.from("public_profiles").select("id, display_name, area_name, resident_years").in("id", authorIds),
      supabase.from("verification_requests").select("id, spot_id").in("spot_id", spotIds).eq("status", "open"),
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

  const openRequestIdBySpot = new Map<string, string>();
  for (const row of (openRequestRows ?? []) as Array<{ id: string; spot_id: string }>) {
    // 「同一スポットに open は高々1件」（部分ユニークインデックス）が保証されているため上書きで問題ない。
    openRequestIdBySpot.set(row.spot_id, row.id);
  }

  return rows.map((row) =>
    mapSpotRow(row, {
      city,
      author: authorsById.get(row.author_id) ?? null,
      tags: tagsBySpot.get(row.id) ?? [],
      verifications: verificationsBySpot.get(row.id) ?? [],
      endorsementCount: endorsementCountBySpot.get(row.id) ?? 0,
      openRequestId: openRequestIdBySpot.get(row.id) ?? null,
      origin: effectiveOrigin,
    }),
  );
}

/** listSpotsByAuthor 用: 複数の街にまたがる可能性がある spots 行を、街ごとにまとめて hydrate する。 */
async function hydrateSpotRowsAcrossCities(rows: SpotRow[]): Promise<Spot[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();
  const cityIds = [...new Set(rows.map((r) => r.city_id))];
  const { data: cityRows, error } = await supabase.from("cities").select("*").in("id", cityIds);
  if (error) throw error;
  const citiesById = new Map(((cityRows ?? []) as CityRow[]).map((c) => [c.id, mapCityRow(c)]));

  const groups = new Map<string, SpotRow[]>();
  for (const row of rows) {
    const list = groups.get(row.city_id) ?? [];
    list.push(row);
    groups.set(row.city_id, list);
  }

  const results: Spot[] = [];
  for (const [cityId, groupRows] of groups) {
    const city = citiesById.get(cityId);
    if (!city) continue;
    results.push(...(await hydrateSpotRows(groupRows, city)));
  }
  return results;
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

/** 必ず sortSpots を通して返す。status='published' のみ。distanceMeters/walkMinutes を埋める。 */
export async function listSpots(query: SpotQuery): Promise<Spot[]> {
  if (!isSupabaseConfigured()) {
    fallbackLog("listSpots");
    const city = FIXTURE_CITIES.find((c) => c.slug === query.citySlug);
    if (!city) return [];
    const published = FIXTURE_SPOTS.filter((s) => s.citySlug === query.citySlug && s.status === "published");
    return applySpotQuery(published, query, { lat: city.centerLat, lng: city.centerLng });
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

  // hydrateSpotRows は distanceMeters を仮の origin（街の中心）で一度埋めるが、
  // applySpotQuery が query.origin を優先して最終的に上書きするため二重計算にはなるが結果は正しい。
  const spots = await hydrateSpotRows((data ?? []) as SpotRow[], city, query.origin);
  return applySpotQuery(spots, { ...query, q: undefined }, { lat: city.centerLat, lng: city.centerLng }); // q は既に SQL 側で絞り込み済み
}

export async function getSpot(id: string): Promise<Spot | null> {
  if (!isSupabaseConfigured()) {
    fallbackLog("getSpot");
    const spot = findFixtureSpot(id);
    if (!spot) return null;
    const city = FIXTURE_CITIES.find((c) => c.slug === spot.citySlug);
    const origin = city ? { lat: city.centerLat, lng: city.centerLng } : { lat: spot.lat, lng: spot.lng };
    return withDistance(spot, origin);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("spots").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as SpotRow;
  const city = await getCity((await supabase.from("cities").select("slug").eq("id", row.city_id).maybeSingle()).data?.slug ?? "");
  const cityResolved = city ?? { id: row.city_id, slug: "", name: "", nameKana: "", isPort: false, centerLat: row.lat, centerLng: row.lng, defaultZoom: 13, featuredArea: null };
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
    const viewerHomeCitySlug = fixtureUserHomeCitySlug(viewerId);
    const pending = FIXTURE_SPOTS.filter(
      (s) =>
        s.citySlug === citySlug &&
        s.status === "pending" &&
        (s.authorId === viewerId || viewerHomeCitySlug === citySlug),
    );
    const city = FIXTURE_CITIES.find((c) => c.slug === citySlug);
    const sorted = sortSpots(pending);
    return city ? withDistances(sorted, { lat: city.centerLat, lng: city.centerLng }) : sorted;
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

  const rows = (data ?? []) as Array<{
    id: string;
    user_id: string;
    spot_id: string;
    planned_at: string | null;
    meta: string | null;
    created_at: string;
  }>;
  const bookmarks: Bookmark[] = [];
  for (const row of rows) {
    const spot = await getSpot(row.spot_id);
    if (!spot) continue;
    bookmarks.push({
      id: row.id,
      userId: row.user_id,
      spotId: row.spot_id,
      plannedAt: row.planned_at,
      meta: row.meta,
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

// =========================================================
// 確認依頼（verification_requests）— Spec §9.1・CONTRACT追補
// =========================================================

export async function getVerificationRequest(id: string): Promise<VerificationRequest | null> {
  if (!isSupabaseConfigured()) {
    fallbackLog("getVerificationRequest");
    return findFixtureVerificationRequest(id);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("verification_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapVerificationRequestRow(data as VerificationRequestRow) : null;
}

export async function listOpenRequests(userId: string): Promise<VerificationRequest[]> {
  if (!isSupabaseConfigured()) {
    fallbackLog("listOpenRequests");
    return FIXTURE_VERIFICATION_REQUESTS.filter((r) => r.userId === userId && r.status === "open");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("verification_requests")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "open");
  if (error) throw error;
  return ((data ?? []) as VerificationRequestRow[]).map(mapVerificationRequestRow);
}

// =========================================================
// プロフィール（S7）— CONTRACT追補
// =========================================================

interface UserRow {
  id: string;
  display_name: string;
  home_city_id: string | null;
  area_name: string | null;
  resident_years: number | null;
  avatar_url: string | null;
  lantern_points: number;
  created_at: string;
}

function mapUserRow(row: UserRow): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    homeCityId: row.home_city_id,
    areaName: row.area_name,
    residentYears: row.resident_years,
    avatarUrl: row.avatar_url,
    lanternPoints: row.lantern_points,
    createdAt: row.created_at,
  };
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (!isSupabaseConfigured()) {
    fallbackLog("getUserProfile");
    return fixtureUserProfile(userId);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data ? mapUserRow(data as UserRow) : null;
}

export async function getProfileStats(userId: string): Promise<{
  spotsCreated: number;
  verificationsAnswered: number;
  spotsKeptQuiet: number;
  pendingRequestCount: number;
  winterVerificationCount: number;
  publishedPortSpotCount: number;
}> {
  if (!isSupabaseConfigured()) {
    fallbackLog("getProfileStats");
    return fixtureProfileStats(userId);
  }

  const supabase = await createClient();
  const [{ data: authoredSpots, error: spotsError }, { data: verifications, error: verificationsError }, { count: openRequestCount, error: requestsError }] =
    await Promise.all([
      supabase.from("spots").select("id, status, quietness, cities(is_port)").eq("author_id", userId),
      supabase.from("verifications").select("created_at").eq("user_id", userId),
      supabase.from("verification_requests").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "open"),
    ]);
  if (spotsError) throw spotsError;
  if (verificationsError) throw verificationsError;
  if (requestsError) throw requestsError;

  type AuthoredSpotRow = { id: string; status: Spot["status"]; quietness: Quietness; cities: { is_port: boolean } | { is_port: boolean }[] | null };
  const authoredRows = (authoredSpots ?? []) as AuthoredSpotRow[];
  const isPort = (row: AuthoredSpotRow) => (Array.isArray(row.cities) ? row.cities[0]?.is_port === true : row.cities?.is_port === true);

  const verificationRows = (verifications ?? []) as Array<{ created_at: string }>;

  return {
    spotsCreated: authoredRows.length,
    verificationsAnswered: verificationRows.length,
    spotsKeptQuiet: authoredRows.filter((r) => r.status === "published" && r.quietness === "quiet").length,
    pendingRequestCount: openRequestCount ?? 0,
    winterVerificationCount: verificationRows.filter((v) => {
      const month = new Date(v.created_at).getUTCMonth() + 1;
      return month === 12 || month === 1 || month === 2;
    }).length,
    publishedPortSpotCount: authoredRows.filter((r) => r.status === "published" && isPort(r)).length,
  };
}

export async function listSpotsByAuthor(userId: string): Promise<Spot[]> {
  if (!isSupabaseConfigured()) {
    fallbackLog("listSpotsByAuthor");
    const spots = fixtureSpotsByAuthor(userId);
    const decorated = spots.map((s) => {
      const city = fixtureCityById(s.cityId);
      return city ? withDistance(s, { lat: city.centerLat, lng: city.centerLng }) : s;
    });
    return sortSpots(decorated);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("spots").select("*").eq("author_id", userId);
  if (error) throw error;
  const spots = await hydrateSpotRowsAcrossCities((data ?? []) as SpotRow[]);
  return sortSpots(spots);
}
