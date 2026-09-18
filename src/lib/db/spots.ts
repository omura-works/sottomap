// データアクセス層（docs/CONTRACT.md `src/lib/db/spots.ts` + 追補 2026-09-09）
//
// デモモード（Spec §9.13.1。URASUPO_DEMO_MODE=1 を明示したときだけ）では、supabase/seed.sql 相当の
// インメモリ・フィクスチャ（./fixtures.ts）を読む。それ以外は Supabase（PostgREST）を読む。
// 呼び出し側は分岐を意識する必要はなく、常に同じシグネチャで使える。
//
// 一覧を返す経路は必ず sortSpots（domain/ordering.ts）を通す。
// distanceMeters/walkMinutes は、呼び出し元が origin を渡せない経路も含め、
// 「origin があればそこから、無ければ街の中心から」常に埋める（CONTRACT追補）。
//
// Supabase 経路の方針:
//   - 関連クエリ（タグ・確認履歴・承認・投稿者・open な依頼・街）の `.error` は必ず確認し、例外にする。
//     失敗を「タグなし」「承認0」などの空データに見せない。
//   - 現在の静けさは spots.quietness が正本（answer_verification が回答と同じトランザクションで更新する）。
//   - 並び順の4キー（静けさ・距離・最終確認・id）は spots 行だけで決まるので、関連データを取る前に
//     行だけで並べて件数を絞り、関連データは表示する行の分だけまとめて取る（N+1 にしない）。

import { computeWalkMinutes, haversineMeters } from "../domain/geo";
import { countAnswerableRequests, latestMissedRequestId } from "../domain/lifecycle";
import { isWinterMonth } from "../domain/lantern";
import { sortSpots } from "../domain/ordering";
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

type LatLng = { lat: number; lng: number };

function fallbackLog(fnName: string): void {
  // デモモード（フィクスチャ）で動いていることが分かるようにログを残す。
  console.debug(`[urasupo/db] ${fnName}: デモモードのためフィクスチャ（seed.sql相当）を使用します。`);
}

/** Supabase の結果の error を例外にする（空データと区別する）。 */
function throwIfError(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}の取得に失敗しました: ${error.message}`);
}

// =========================================================
// 検索語・タグフィルタ・距離ソート・距離/徒歩分の共通ロジック
// （Supabase 経路・フィクスチャ経路の両方から使う）
// =========================================================

/**
 * origin（無ければ街の中心）からの distanceMeters/walkMinutes を1件の Spot に埋める。
 * CONTRACT追補: 「listSpots に origin があれば距離と徒歩分を埋める。無ければ街の中心から算出。」
 * を listSpots に限らず、Spot を返す全経路で一貫して適用する。
 */
function withDistance(spot: Spot, origin: LatLng): Spot {
  const meters = haversineMeters(origin, { lat: spot.lat, lng: spot.lng });
  return { ...spot, distanceMeters: meters, walkMinutes: computeWalkMinutes(meters) };
}

function withDistances(spots: Spot[], origin: LatLng): Spot[] {
  return spots.map((s) => withDistance(s, origin));
}

/** 'quiet-now' / 'within-10min' 以外のフィルタ（＝タグ slug）。 */
function tagFilterSlugs(filters: string[] | undefined): string[] {
  return (filters ?? []).filter((f) => f !== "quiet-now" && f !== "within-10min");
}

/**
 * SPEC §9.14-5: 「まだ静か」チップは結果を除外しない（表示側で並べ替え・見出し分けするだけ）。
 * このため 'quiet-now' はここでは絞り込み条件として扱わない。
 * Codex R9 重要1: 「徒歩10分」もサーバー側では絞り込まない（クライアントだけで判定する。
 * サーバーの街中心基準と閲覧者の現在地基準を両方かけると積集合になり0件になりうるため）。
 */
function matchesFilter(spot: Spot, filter: string): boolean {
  // day-only / cash-only / solo-ok 等のタグ slug
  return spot.tags.some((tag) => tag.slug === filter);
}

/** 検索語の正規化（前後の空白を除く）。空なら null。 */
function normalizeQuery(q: string | undefined): string | null {
  const trimmed = q?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** 検索対象の列（フィクスチャと実DBで共通）: 名前・理由・カテゴリ・地域名。 */
const SEARCH_COLUMNS = ["name", "reason", "category", "area_name"] as const;

function matchesQuery(spot: Spot, needle: string): boolean {
  const lower = needle.toLowerCase();
  return [spot.name, spot.reason, spot.category ?? "", spot.areaName ?? ""].some((field) =>
    field.toLowerCase().includes(lower),
  );
}

/**
 * PostgREST の `or=(...)` に入れる ilike の値を作る。
 * 1. LIKE の特殊文字（\ % _）と PostgREST のワイルドカード（*）を `\` で打ち消す。
 * 2. 全体を二重引用符で囲み、引用符内の特殊文字（\ "）を `\` で打ち消す。
 *    （`,` `(` `)` `.` は引用符内なら区切りとして扱われない。）
 */
export function buildIlikeOrFilter(needle: string, columns: readonly string[] = SEARCH_COLUMNS): string {
  const likeEscaped = needle.replace(/[\\%_*]/g, (ch) => `\\${ch}`);
  const pattern = `%${likeEscaped}%`;
  const quoted = `"${pattern.replace(/[\\"]/g, (ch) => `\\${ch}`)}"`;
  return columns.map((column) => `${column}.ilike.${quoted}`).join(",");
}

/** フィクスチャ経路: 絞り込み・並び替え・件数上限・距離/徒歩分の付与をまとめて適用する。 */
function applySpotQuery(spots: Spot[], query: SpotQuery, cityCenter: LatLng): Spot[] {
  let result = spots;

  const needle = normalizeQuery(query.q);
  if (needle) {
    result = result.filter((spot) => matchesQuery(spot, needle));
  }
  // SPEC §9.14-5: 'quiet-now' は絞り込み（除外）には使わない。表示側の並べ替え専用。
  // Codex R9 重要1: 'within-10min' もサーバーでは絞り込まない（クライアント側だけで判定）。
  const activeExcludeFilters = (query.filters ?? []).filter((f) => f !== "quiet-now" && f !== "within-10min");
  if (activeExcludeFilters.length > 0) {
    result = result.filter((spot) => activeExcludeFilters.every((f) => matchesFilter(spot, f)));
  }

  const origin = query.origin ?? cityCenter;
  const sorted = sortSpots(withDistances(result, origin));
  return query.limit ? sorted.slice(0, query.limit) : sorted;
}

/** 直近の確認「回」に参加した人数（同じ最新日から24時間以内に記録された確認の人数）。 */
function computeVerifierCount(verifications: Array<{ userId: string; createdAt: string }>): number {
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

export interface CityRow {
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

export interface TagRow {
  id: string;
  slug: string;
  label: string;
  kind: TagKind;
}

/**
 * `spot_tags?select=spot_id,tags(...)` の1行。spot_tags → tags は多対一なので、
 * PostgREST は `tags` を**単一のオブジェクト**（参照先が読めなければ null）で返す。配列ではない。
 */
export interface SpotTagLinkRow {
  spot_id: string;
  tags: TagRow | null;
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

export interface SpotRow {
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

/** 表示用の投稿者情報（public_profiles ビューの行）。 */
export interface AuthorRow {
  id: string;
  display_name: string;
  area_name: string | null;
  resident_years: number | null;
}

/** hydrate に必要な関連データ（PostgREST の応答そのままの形）。 */
export interface SpotRelatedRows {
  tagLinks: SpotTagLinkRow[];
  verifications: Array<{ spot_id: string; user_id: string; created_at: string }>;
  endorsements: Array<{ spot_id: string }>;
  authors: AuthorRow[];
  openRequests: Array<{ id: string; spot_id: string }>;
}

function authorLabel(author: AuthorRow | undefined): string | null {
  if (!author) return null;
  return `${author.area_name ?? ""}に${author.resident_years ?? "?"}年、${author.display_name}`;
}

/** 関連データなしで spots 行を Spot にする（並び替え・件数の絞り込み用。関連の値は空）。 */
function bareSpotFromRow(row: SpotRow, city: City, origin: LatLng): Spot {
  const distanceMeters = haversineMeters(origin, { lat: row.lat, lng: row.lng });
  return {
    id: row.id,
    cityId: row.city_id,
    citySlug: city.slug,
    cityName: city.name,
    name: row.name,
    areaName: row.area_name,
    address: row.address,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
    status: row.status,
    // 正本は spots.quietness（answer_verification が同じトランザクションで更新する）。
    quietness: row.quietness,
    reason: row.reason,
    hoverDescription: row.hover_description,
    visitFrequency: row.visit_frequency,
    authorId: row.author_id,
    authorLabel: null,
    photoUrl: row.photo_url,
    tags: [],
    endorsementCount: 0,
    verifierCount: 0,
    lastVerifiedAt: row.last_verified_at,
    nextVerificationAt: row.next_verification_at,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    distanceMeters,
    walkMinutes: computeWalkMinutes(distanceMeters),
    openRequestId: null,
  };
}

/** 街が読めない spots 行は RLS かデータの不整合なので例外にする。 */
function cityFor(row: SpotRow, citiesById: ReadonlyMap<string, City>): City {
  const city = citiesById.get(row.city_id);
  if (!city) throw new Error(`スポットの街の取得に失敗しました: ${row.city_id}`);
  return city;
}

/**
 * spots 行と関連データ（PostgREST の応答の形）からドメインの Spot[] を組み立てる。純粋関数（テスト用に export）。
 * 行の順序は保つ。origin が無ければ各スポットの街の中心から距離を測る（CONTRACT追補）。
 */
export function assembleSpots(
  rows: SpotRow[],
  related: SpotRelatedRows,
  citiesById: ReadonlyMap<string, City>,
  origin?: LatLng,
): Spot[] {
  const tagsBySpot = new Map<string, Tag[]>();
  for (const link of related.tagLinks) {
    if (!link.tags) continue; // 参照先のタグが読めない行は飛ばす
    const list = tagsBySpot.get(link.spot_id) ?? [];
    list.push(mapTagRow(link.tags));
    tagsBySpot.set(link.spot_id, list);
  }

  const verificationsBySpot = new Map<string, Array<{ userId: string; createdAt: string }>>();
  for (const row of related.verifications) {
    const list = verificationsBySpot.get(row.spot_id) ?? [];
    list.push({ userId: row.user_id, createdAt: row.created_at });
    verificationsBySpot.set(row.spot_id, list);
  }

  const endorsementCountBySpot = new Map<string, number>();
  for (const row of related.endorsements) {
    endorsementCountBySpot.set(row.spot_id, (endorsementCountBySpot.get(row.spot_id) ?? 0) + 1);
  }

  const authorsById = new Map(related.authors.map((row) => [row.id, row]));

  const openRequestIdBySpot = new Map<string, string>();
  for (const row of related.openRequests) {
    // 「同一スポットに open は高々1件」（部分ユニークインデックス）が保証されているため上書きで問題ない。
    openRequestIdBySpot.set(row.spot_id, row.id);
  }

  return rows.map((row) => {
    const city = cityFor(row, citiesById);
    const bare = bareSpotFromRow(row, city, origin ?? { lat: city.centerLat, lng: city.centerLng });
    return {
      ...bare,
      authorLabel: authorLabel(authorsById.get(row.author_id)),
      tags: tagsBySpot.get(row.id) ?? [],
      endorsementCount: endorsementCountBySpot.get(row.id) ?? 0,
      verifierCount: computeVerifierCount(verificationsBySpot.get(row.id) ?? []),
      openRequestId: openRequestIdBySpot.get(row.id) ?? null,
    };
  });
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * ログイン中のセッション（cookie）があるか。問い合わせを出すかどうかの判断にだけ使う
 * （本人確認には使わない。読める行は DB の権限と RLS が決める）。
 */
async function hasSession(supabase: SupabaseServerClient): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`ログイン状態の確認に失敗しました: ${error.message}`);
  return data.session !== null;
}

/** 表示する spots 行の分だけ、関連データを1種類1クエリでまとめて取る。 */
async function fetchRelatedRows(supabase: SupabaseServerClient, rows: SpotRow[]): Promise<SpotRelatedRows> {
  if (rows.length === 0) {
    return { tagLinks: [], verifications: [], endorsements: [], authors: [], openRequests: [] };
  }
  const spotIds = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const signedIn = await hasSession(supabase);

  const [tagLinks, verifications, endorsements, authors, openRequests] = await Promise.all([
    supabase.from("spot_tags").select("spot_id, tags(id, slug, label, kind)").in("spot_id", spotIds),
    supabase.from("verifications").select("spot_id, user_id, created_at").in("spot_id", spotIds),
    supabase.from("endorsements").select("spot_id").in("spot_id", spotIds),
    // Spec §9.13.6: users の全列は本人しか読めない。投稿者クレジットは表示用の列だけを出すビュー経由。
    supabase.from("public_profiles").select("id, display_name, area_name, resident_years").in("id", authorIds),
    // Spec §9.13.6・0006: 確認依頼は本人宛てしか読めず、未ログイン（anon）には表の SELECT 権限自体が無い。
    // 未ログインなら問い合わせない（読めるのは常に0件なので、権限エラーを出さずに空として扱う）。
    signedIn
      ? supabase.from("verification_requests").select("id, spot_id").in("spot_id", spotIds).eq("status", "open")
      : Promise.resolve({ data: [] as Array<{ id: string; spot_id: string }>, error: null }),
  ]);
  throwIfError("タグ", tagLinks.error);
  throwIfError("確認履歴", verifications.error);
  throwIfError("承認", endorsements.error);
  throwIfError("投稿者", authors.error);
  throwIfError("確認依頼", openRequests.error);

  return {
    tagLinks: (tagLinks.data ?? []) as unknown as SpotTagLinkRow[],
    verifications: (verifications.data ?? []) as SpotRelatedRows["verifications"],
    endorsements: (endorsements.data ?? []) as SpotRelatedRows["endorsements"],
    authors: (authors.data ?? []) as AuthorRow[],
    openRequests: (openRequests.data ?? []) as SpotRelatedRows["openRequests"],
  };
}

/** spots 行の街をまとめて取る。読めない街があれば例外。 */
async function fetchCitiesById(supabase: SupabaseServerClient, rows: SpotRow[]): Promise<Map<string, City>> {
  const cityIds = [...new Set(rows.map((r) => r.city_id))];
  if (cityIds.length === 0) return new Map();
  const { data, error } = await supabase.from("cities").select("*").in("id", cityIds);
  throwIfError("街", error);
  const cities = new Map(((data ?? []) as CityRow[]).map((c) => [c.id, mapCityRow(c)]));
  for (const id of cityIds) {
    if (!cities.has(id)) throw new Error(`スポットの街の取得に失敗しました: ${id}`);
  }
  return cities;
}

/** spots 行（複数の街にまたがってよい）を Spot[] にする。行の順序は保つ。 */
async function hydrateSpotRows(
  supabase: SupabaseServerClient,
  rows: SpotRow[],
  options: { citiesById?: ReadonlyMap<string, City>; origin?: LatLng } = {},
): Promise<Spot[]> {
  if (rows.length === 0) return [];
  const [citiesById, related] = await Promise.all([
    options.citiesById ? Promise.resolve(options.citiesById) : fetchCitiesById(supabase, rows),
    fetchRelatedRows(supabase, rows),
  ]);
  return assembleSpots(rows, related, citiesById, options.origin);
}

/**
 * 1つの街の spots 行を、行だけで並べて（§9.5 の4キーはすべて spots 行で決まる）絞り込み・件数制限し、
 * 残った行の分だけ関連データを取って返す。
 */
async function selectAndHydrate(
  supabase: SupabaseServerClient,
  rows: SpotRow[],
  city: City,
  options: { origin?: LatLng; filters?: string[]; limit?: number },
): Promise<Spot[]> {
  const origin = options.origin ?? { lat: city.centerLat, lng: city.centerLng };
  // Codex R9 重要1: 'within-10min' はサーバーでは絞り込まない（クライアント側だけで判定する。
  // サーバー基準点と閲覧者の現在地基準点の両方でかけると積集合になり0件になりうるため）。
  let candidates = rows;

  const tagSlugs = tagFilterSlugs(options.filters);
  if (tagSlugs.length > 0 && candidates.length > 0) {
    const { data, error } = await supabase
      .from("spot_tags")
      .select("spot_id, tags!inner(slug)")
      .in("spot_id", candidates.map((row) => row.id))
      .in("tags.slug", tagSlugs);
    throwIfError("タグ", error);
    const slugsBySpot = new Map<string, Set<string>>();
    for (const link of (data ?? []) as unknown as Array<{ spot_id: string; tags: { slug: string } | null }>) {
      if (!link.tags) continue;
      const set = slugsBySpot.get(link.spot_id) ?? new Set<string>();
      set.add(link.tags.slug);
      slugsBySpot.set(link.spot_id, set);
    }
    candidates = candidates.filter((row) => tagSlugs.every((slug) => slugsBySpot.get(row.id)?.has(slug)));
  }

  const citiesById = new Map([[city.id, city]]);
  const ordered = sortSpots(candidates.map((row) => bareSpotFromRow(row, city, origin)));
  const limited = options.limit ? ordered.slice(0, options.limit) : ordered;
  const rowsById = new Map(candidates.map((row) => [row.id, row]));
  const selectedRows = limited.map((spot) => rowsById.get(spot.id)).filter((row): row is SpotRow => row !== undefined);

  const spots = await hydrateSpotRows(supabase, selectedRows, { citiesById, origin });
  return sortSpots(spots);
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
  const needle = normalizeQuery(query.q);
  if (needle) {
    builder = builder.or(buildIlikeOrFilter(needle));
  }
  // SPEC §9.14-5: 'quiet-now' はDB側の絞り込み（除外）には使わない。表示側の並べ替え専用。
  const { data, error } = await builder;
  if (error) throw error;

  return selectAndHydrate(supabase, (data ?? []) as SpotRow[], city, {
    origin: query.origin,
    filters: query.filters,
    limit: query.limit,
  });
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
  const [spot] = await hydrateSpotRows(supabase, [data as SpotRow]);
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
    .select("id, spot_id, user_id, answer, note, created_at")
    .eq("spot_id", spotId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
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
    return sortSpots(city ? withDistances(pending, { lat: city.centerLat, lng: city.centerLng }) : pending);
  }

  const city = await getCity(citySlug);
  if (!city) return [];
  const supabase = await createClient();
  // 見える範囲（同じ街の住人・投稿者本人）は RLS が決める。
  const { data, error } = await supabase
    .from("spots")
    .select("*")
    .eq("city_id", city.id)
    .eq("status", "pending");
  if (error) throw error;
  return selectAndHydrate(supabase, (data ?? []) as SpotRow[], city, {});
}

interface BookmarkRow {
  id: string;
  user_id: string;
  spot_id: string;
  planned_at: string | null;
  meta: string | null;
  created_at: string;
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

  const rows = (data ?? []) as BookmarkRow[];
  if (rows.length === 0) return [];

  // 栞のスポットをまとめて取得し、関連データも1種類1クエリで組み立てる（N+1 にしない）。
  const spotIds = [...new Set(rows.map((row) => row.spot_id))];
  const { data: spotRows, error: spotsError } = await supabase.from("spots").select("*").in("id", spotIds);
  throwIfError("栞のスポット", spotsError);
  const spots = await hydrateSpotRows(supabase, (spotRows ?? []) as SpotRow[]);
  const spotsById = new Map(spots.map((spot) => [spot.id, spot]));

  // 読めないスポット（RLS で非公開になったもの等）は、これまでどおり一覧から外す。
  return rows.flatMap((row) => {
    const spot = spotsById.get(row.spot_id);
    if (!spot) return [];
    return [
      {
        id: row.id,
        userId: row.user_id,
        spotId: row.spot_id,
        plannedAt: row.planned_at,
        meta: row.meta,
        createdAt: row.created_at,
        spot,
      },
    ];
  });
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
  const supabase = await createClient();
  let builder = supabase
    .from("spots")
    .select("id", { count: "exact", head: true })
    .eq("city_id", city.id)
    .eq("status", "published")
    .eq("quietness", "quiet");
  if (areaName) builder = builder.eq("area_name", areaName);
  const { count, error } = await builder;
  if (error) throw error;
  return count ?? 0;
}

/** 「今週、静けさが確認された店」— 直近7日に確認があった店を確認人数つきで */
export async function listRecentlyVerified(
  citySlug: string,
  limit?: number,
): Promise<Array<{ spot: Spot; verifierCount: number }>> {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  if (!isSupabaseConfigured()) {
    fallbackLog("listRecentlyVerified");
    const city = FIXTURE_CITIES.find((c) => c.slug === citySlug);
    if (!city) return [];
    const spotIdsWithRecentVerification = new Set(
      FIXTURE_VERIFICATIONS.filter((v) => new Date(v.createdAt).getTime() >= sevenDaysAgo).map((v) => v.spotId),
    );
    const spots = FIXTURE_SPOTS.filter(
      (s) => s.citySlug === citySlug && s.status === "published" && spotIdsWithRecentVerification.has(s.id),
    );
    const sorted = sortSpots(withDistances(spots, { lat: city.centerLat, lng: city.centerLng }));
    const limited = limit ? sorted.slice(0, limit) : sorted;
    return limited.map((spot) => ({ spot, verifierCount: spot.verifierCount }));
  }

  const city = await getCity(citySlug);
  if (!city) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spots")
    .select("*")
    .eq("city_id", city.id)
    .eq("status", "published")
    .gte("last_verified_at", new Date(sevenDaysAgo).toISOString());
  if (error) throw error;
  const spots = await selectAndHydrate(supabase, (data ?? []) as SpotRow[], city, { limit });
  return spots.map((spot) => ({ spot, verifierCount: spot.verifierCount }));
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

/**
 * 対象スポットの最新の missed 依頼ID（dormant からの復帰の対象。Spec §9.13.3）。
 * 依頼は本人宛てしか読めない（RLS）ため、投稿者本人の画面からだけ意味を持つ。
 */
export async function getLatestMissedRequestId(spotId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    fallbackLog("getLatestMissedRequestId");
    return latestMissedRequestId(FIXTURE_VERIFICATION_REQUESTS, spotId);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("verification_requests")
    .select("id")
    .eq("spot_id", spotId)
    .eq("status", "missed")
    .order("due_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? String((data as { id: string }).id) : null;
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
  home_city_changed_at: string | null;
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
    homeCityChangedAt: row.home_city_changed_at ?? null,
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
  const [{ data: authoredSpots, error: spotsError }, { data: verifications, error: verificationsError }, { data: requestRows, error: requestsError }] =
    await Promise.all([
      supabase.from("spots").select("id, status, quietness, cities(is_port)").eq("author_id", userId),
      supabase.from("verifications").select("created_at").eq("user_id", userId),
      // Spec §9.13.3: 「確認待ち」は回答できる依頼だけ数える（期限到来済みの open ＋ 復帰できる最新の missed）。
      supabase
        .from("verification_requests")
        .select("id, spot_id, due_at, status, created_at")
        .eq("user_id", userId)
        .in("status", ["open", "missed"]),
    ]);
  if (spotsError) throw spotsError;
  if (verificationsError) throw verificationsError;
  if (requestsError) throw requestsError;

  // spots → cities は多対一なので、PostgREST は cities を単一オブジェクト（または null）で返す。
  type AuthoredSpotRow = { id: string; status: Spot["status"]; quietness: Quietness; cities: { is_port: boolean } | null };
  const authoredRows = (authoredSpots ?? []) as unknown as AuthoredSpotRow[];
  const isPort = (row: AuthoredSpotRow) => row.cities?.is_port === true;

  const verificationRows = (verifications ?? []) as Array<{ created_at: string }>;
  const spotStatusById = new Map(authoredRows.map((row) => [row.id, row.status]));
  const answerableInputs = ((requestRows ?? []) as Array<{
    id: string;
    spot_id: string;
    due_at: string;
    status: RequestStatus;
    created_at: string;
  }>).flatMap((row) => {
    const spotStatus = spotStatusById.get(row.spot_id);
    return spotStatus
      ? [{ id: row.id, spotId: row.spot_id, dueAt: row.due_at, status: row.status, createdAt: row.created_at, spotStatus }]
      : [];
  });

  return {
    spotsCreated: authoredRows.length,
    verificationsAnswered: verificationRows.length,
    spotsKeptQuiet: authoredRows.filter((r) => r.status === "published" && r.quietness === "quiet").length,
    pendingRequestCount: countAnswerableRequests(answerableInputs, new Date()),
    // 日本時間の暦月で12〜2月（domain/lantern.ts）。
    winterVerificationCount: verificationRows.filter((v) => isWinterMonth(v.created_at)).length,
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
  const spots = await hydrateSpotRows(supabase, (data ?? []) as SpotRow[]);
  return sortSpots(spots);
}
