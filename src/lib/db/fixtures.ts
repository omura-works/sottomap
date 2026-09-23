// Supabase 実インスタンス未接続時のフォールバック・フィクスチャ。
//
// supabase/seed.sql と同じ内容（街8件・タグ10件・実在6店・確認履歴・承認・確認依頼・栞4件）を
// インメモリの TypeScript オブジェクトとして持つ。他タスク（T3〜T5）が画面を作れるよう、
// src/lib/db/spots.ts の各関数は Supabase 環境変数が無いときに自動でここへフォールバックする。
// src/lib/db/mutations.ts の書き込み系関数も、同じ未接続条件下ではここの配列を直接
// mutate（push/splice）することでインメモリに反映する（プロセス起動中のみ有効）。
//
// 実在店データの出典は supabase/seed.sql のコメントと同じ（docs/SPEC.md §7）。
// 確認人数・承認・灯りポイント等はゲームメカニクス上の架空デモ値。
//
// 【重要・架空データの注記】シハチ鮮魚店/ザンギ本舗/輝風の3店には、Spec §9.8・§1 が
// 指定する「地元3人/5人/4人が確認」という文言を満たすため、実際のRLS（verifications は
// 対象スポットの投稿者のみ挿入可・Spec §9.2）では起こり得ない「投稿者以外のユーザーによる
// 確認」を意図的にシード投入している。これは本番運用では発生しない、デモ表示専用の
// 架空データである（§7「確認人数…はUI上の架空データ」の一部）。
//
// 【seed.sql に無い、デモモード専用のデータ】（Spec §7「シードは実在する店のみ」のため seed には入れない）
//   - 北24条の小さな喫茶店（pending。承認の導線）
//   - 大通の小さな定食屋／大通の古い蕎麦屋（published。デモ利用者 Aさん（札幌在住）が投稿者で、
//     期限到来済みの確認依頼・期限前の確認依頼を持つ。確認の導線と E2E に使う）
// それ以外（実在6店の投稿者・静けさ・時刻・確認履歴）は seed.sql と一致させる。

import { canChangeHomeCity, homeCityLimitMessage, nextHomeCityChangeAt } from "../domain/home-city";
import { isWinterMonth } from "../domain/lantern";
import { countAnswerableRequests, isMissed } from "../domain/lifecycle";
import { nextDayAtTokyoTime } from "../format/date-time";
import type {
  Badge,
  Bookmark,
  City,
  Quietness,
  RequestStatus,
  Spot,
  SpotStatus,
  Tag,
  UserProfile,
  VerificationRequest,
  VisitFrequency,
  Verification,
} from "./types";

/** now() ± n日 の ISO8601 文字列。n>0 で未来、n<0 で過去（seed.sql の interval 表記に対応）。 */
function offsetDaysISO(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// =========================================================
// 1. cities
// =========================================================
export const FIXTURE_CITIES: City[] = [
  { id: "a0000000-0000-4000-8000-000000000001", slug: "sapporo", name: "札幌", nameKana: "さっぽろ", isPort: false, centerLat: 43.0621, centerLng: 141.3544, defaultZoom: 12.5, featuredArea: "北24条" },
  { id: "a0000000-0000-4000-8000-000000000002", slug: "otaru", name: "小樽", nameKana: "おたる", isPort: true, centerLat: 43.1907, centerLng: 140.9947, defaultZoom: 13.5, featuredArea: "色内" },
  { id: "a0000000-0000-4000-8000-000000000003", slug: "hakodate", name: "函館", nameKana: "はこだて", isPort: true, centerLat: 41.7687, centerLng: 140.7288, defaultZoom: 13.5, featuredArea: null },
  { id: "a0000000-0000-4000-8000-000000000004", slug: "asahikawa", name: "旭川", nameKana: "あさひかわ", isPort: false, centerLat: 43.7706, centerLng: 142.3649, defaultZoom: 13, featuredArea: null },
  { id: "a0000000-0000-4000-8000-000000000005", slug: "furano", name: "富良野", nameKana: "ふらの", isPort: false, centerLat: 43.3416, centerLng: 142.3831, defaultZoom: 13, featuredArea: null },
  { id: "a0000000-0000-4000-8000-000000000006", slug: "kushiro", name: "釧路", nameKana: "くしろ", isPort: true, centerLat: 42.9849, centerLng: 144.382, defaultZoom: 13, featuredArea: null },
  { id: "a0000000-0000-4000-8000-000000000007", slug: "obihiro", name: "帯広", nameKana: "おびひろ", isPort: false, centerLat: 42.9238, centerLng: 143.1968, defaultZoom: 13, featuredArea: null },
  { id: "a0000000-0000-4000-8000-000000000008", slug: "wakkanai", name: "稚内", nameKana: "わっかない", isPort: true, centerLat: 45.4155, centerLng: 141.6733, defaultZoom: 13.5, featuredArea: null },
];

// =========================================================
// 2. tags
//    9・10（day-time-main / two-locations-in-city）は Spec §9.8 の S4 タグ3種
//    （魚屋直営=accent2／昼が本番=neutral／市内2店舗=outline）を満たすための追加。
//    fish-shop-direct は §9.8 に合わせ kind を accent → accent2 に変更した。
// =========================================================
export const FIXTURE_TAGS: Tag[] = [
  { id: "e0000000-0000-4000-8000-000000000001", slug: "fish-shop-direct", label: "魚屋直営", kind: "accent2" },
  { id: "e0000000-0000-4000-8000-000000000002", slug: "takeout-ok", label: "持ち帰りもできる", kind: "neutral" },
  { id: "e0000000-0000-4000-8000-000000000003", slug: "night-only", label: "夜が本番", kind: "accent2" },
  { id: "e0000000-0000-4000-8000-000000000004", slug: "locals-market", label: "地元が買いに行く市場", kind: "accent2" },
  { id: "e0000000-0000-4000-8000-000000000005", slug: "morning-only", label: "朝のうちに", kind: "accent2" },
  { id: "e0000000-0000-4000-8000-000000000006", slug: "day-only", label: "昼だけ", kind: "accent2" },
  { id: "e0000000-0000-4000-8000-000000000007", slug: "cash-only", label: "現金のみ", kind: "neutral" },
  { id: "e0000000-0000-4000-8000-000000000008", slug: "solo-ok", label: "ひとりで入れる", kind: "neutral" },
  { id: "e0000000-0000-4000-8000-000000000009", slug: "day-time-main", label: "昼が本番", kind: "neutral" },
  { id: "e0000000-0000-4000-8000-00000000000a", slug: "two-locations-in-city", label: "市内2店舗", kind: "outline" },
];

// =========================================================
// 3. badges（定義。獲得状況は domain/lantern.ts が算出する）
// =========================================================
export const FIXTURE_BADGE_DEFS: Array<Pick<Badge, "slug" | "glyph" | "label">> = [
  { slug: "keeper", glyph: "灯", label: "番人" },
  { slug: "winter", glyph: "雪", label: "冬も歩いた" },
  { slug: "port", glyph: "港", label: "港" },
];

// =========================================================
// 4. users（架空デモアカウント10件）
// =========================================================
interface FixtureUser {
  id: string;
  displayName: string;
  /**
   * mutable: setFixtureUserHomeCity が変える（resetFixtureUserHomeCities で初期値に戻す）。
   * null = 住んでいる街が未設定（DB の users.home_city_id が NULL の利用者に相当）。
   */
  homeCitySlug: string | null;
  /** mutable: 住んでいる街を最後に変えた時刻（ISO8601）。初回設定は数えない。未指定 = 未変更（SPEC §9.16）。 */
  homeCityChangedAt?: string | null;
  areaName: string;
  residentYears: number;
  lanternPoints: number;
  createdAtDaysAgo: number;
}

const FIXTURE_USERS: FixtureUser[] = [
  { id: "b0000000-0000-4000-8000-000000000001", displayName: "Kさん", homeCitySlug: "sapporo", areaName: "北24条", residentYears: 14, lanternPoints: 65, createdAtDaysAgo: 220 },
  { id: "b0000000-0000-4000-8000-000000000002", displayName: "Mさん", homeCitySlug: "sapporo", areaName: "すすきの", residentYears: 8, lanternPoints: 40, createdAtDaysAgo: 300 },
  { id: "b0000000-0000-4000-8000-000000000003", displayName: "Tさん", homeCitySlug: "sapporo", areaName: "すすきの", residentYears: 5, lanternPoints: 25, createdAtDaysAgo: 180 },
  { id: "b0000000-0000-4000-8000-000000000004", displayName: "Aさん", homeCitySlug: "sapporo", areaName: "大通", residentYears: 9, lanternPoints: 30, createdAtDaysAgo: 400 },
  { id: "b0000000-0000-4000-8000-000000000005", displayName: "Nさん", homeCitySlug: "sapporo", areaName: "円山", residentYears: 11, lanternPoints: 20, createdAtDaysAgo: 400 },
  { id: "b0000000-0000-4000-8000-000000000006", displayName: "Sさん", homeCitySlug: "otaru", areaName: "花園", residentYears: 20, lanternPoints: 55, createdAtDaysAgo: 400 },
  { id: "b0000000-0000-4000-8000-000000000007", displayName: "Hさん", homeCitySlug: "otaru", areaName: "新富町", residentYears: 30, lanternPoints: 70, createdAtDaysAgo: 500 },
  { id: "b0000000-0000-4000-8000-000000000008", displayName: "Rさん", homeCitySlug: "otaru", areaName: "色内", residentYears: 10, lanternPoints: 45, createdAtDaysAgo: 600 },
  { id: "b0000000-0000-4000-8000-000000000009", displayName: "Fさん", homeCitySlug: "otaru", areaName: "手宮", residentYears: 6, lanternPoints: 15, createdAtDaysAgo: 600 },
  { id: "b0000000-0000-4000-8000-00000000000a", displayName: "Yさん", homeCitySlug: "otaru", areaName: "塩谷", residentYears: 4, lanternPoints: 10, createdAtDaysAgo: 600 },
];

/** 居住街の初期値（テスト間で元に戻すため）。 */
const INITIAL_HOME_CITY_SLUGS = new Map(FIXTURE_USERS.map((u) => [u.id, u.homeCitySlug]));
const INITIAL_HOME_CITY_CHANGED_AT = new Map(FIXTURE_USERS.map((u) => [u.id, u.homeCityChangedAt ?? null]));

function findUser(id: string): FixtureUser {
  const user = FIXTURE_USERS.find((u) => u.id === id);
  if (!user) throw new Error(`fixture user not found: ${id}`);
  return user;
}

function findCitySlug(slug: string): City {
  const city = FIXTURE_CITIES.find((c) => c.slug === slug);
  if (!city) throw new Error(`fixture city not found: ${slug}`);
  return city;
}

function findCityById(id: string): City | null {
  return FIXTURE_CITIES.find((c) => c.id === id) ?? null;
}

// =========================================================
// 5. spots（実在6店＋デモモード専用の架空3店。実在店は supabase/seed.sql と同じ実データ）
//    reason（引用・説明文）は Spec §9.8「D1 の店3件の説明」の文言に一字一句合わせてある。
// =========================================================
interface RawSpot {
  id: string;
  citySlug: string;
  name: string;
  address: string;
  areaName: string;
  category: string;
  lat: number;
  lng: number;
  status: SpotStatus;
  /** spots.quietness（現在の静けさの正本。seed.sql の値と同じ）。 */
  quietness: Quietness;
  reason: string;
  hoverDescription?: string;
  visitFrequency: VisitFrequency;
  authorId: string;
  photoUrl: string | null;
  publishedAtDaysAgo: number;
  nextVerificationAtDaysAgo: number; // 負の値なら「今から n 日後」
  lastVerifiedAtDaysAgo: number;
  createdAtDaysAgo: number;
  tagSlugs: string[];
}

const RAW_SPOTS: RawSpot[] = [
  {
    id: "d0000000-0000-4000-8000-000000000001",
    citySlug: "sapporo",
    name: "シハチ鮮魚店 北24条店",
    address: "北海道札幌市北区北24条西2丁目1-13 ベアーズ24",
    areaName: "北24条",
    category: "海鮮丼",
    lat: 43.0847,
    lng: 141.3486,
    status: "published",
    quietness: "quiet",
    // Spec §9.8 D1「店3件の説明」1件目（一字一句）。
    reason: "魚屋の直営。地元の値段のまま、海鮮丼になって出てくる。",
    hoverDescription: "魚屋の直営。狸小路の方が行きやすいが、こちらの方が安い。",
    visitFrequency: "monthly",
    authorId: "b0000000-0000-4000-8000-000000000001",
    photoUrl: null,
    publishedAtDaysAgo: 213,
    nextVerificationAtDaysAgo: -87,
    lastVerifiedAtDaysAgo: 3,
    createdAtDaysAgo: 220,
    tagSlugs: ["fish-shop-direct", "day-time-main", "two-locations-in-city"],
  },
  {
    id: "d0000000-0000-4000-8000-000000000002",
    citySlug: "sapporo",
    name: "札幌ザンギ本舗",
    address: "北海道札幌市中央区南六条西4丁目 G4ビル1F",
    areaName: "すすきの",
    category: "ザンギ",
    lat: 43.0552,
    lng: 141.354,
    status: "published",
    quietness: "quiet",
    // Spec §9.8 D1「店3件の説明」2件目（一字一句）。
    reason: "ザンギは唐揚げではない、と地元は言う。持ち帰りもできる。",
    visitFrequency: "weekly",
    authorId: "b0000000-0000-4000-8000-000000000002",
    photoUrl: null,
    publishedAtDaysAgo: 293,
    nextVerificationAtDaysAgo: -85,
    lastVerifiedAtDaysAgo: 5,
    createdAtDaysAgo: 300,
    tagSlugs: ["takeout-ok"],
  },
  {
    id: "d0000000-0000-4000-8000-000000000003",
    citySlug: "sapporo",
    name: "札幌らーめん輝風 すすきの店",
    address: "北海道札幌市中央区南5条西3-1 大松ビル1F",
    areaName: "すすきの",
    category: "味噌ラーメン",
    lat: 43.0562,
    lng: 141.3534,
    status: "published",
    quietness: "crowding",
    // Spec §9.8 D1「店3件の説明」3件目（一字一句）。
    reason: "味噌。夜のすすきので、地元が最後に寄る一杯。",
    visitFrequency: "monthly",
    authorId: "b0000000-0000-4000-8000-000000000003",
    photoUrl: null,
    publishedAtDaysAgo: 175,
    nextVerificationAtDaysAgo: -84,
    lastVerifiedAtDaysAgo: 6,
    createdAtDaysAgo: 180,
    tagSlugs: ["night-only"],
  },
  {
    id: "d0000000-0000-4000-8000-000000000004",
    citySlug: "otaru",
    name: "聖徳太子 飛鳥店",
    address: "北海道小樽市花園1-12-21",
    areaName: "花園",
    category: "日替わり定食",
    lat: 43.1937,
    lng: 140.9989,
    status: "published",
    quietness: "quiet",
    reason: "小樽駅から徒歩10分。観光通りから少し外れているぶん、地元の昼どきが静か。",
    visitFrequency: "weekly",
    authorId: "b0000000-0000-4000-8000-000000000006",
    photoUrl: null,
    publishedAtDaysAgo: 395,
    nextVerificationAtDaysAgo: -50,
    lastVerifiedAtDaysAgo: 40,
    createdAtDaysAgo: 400,
    tagSlugs: [],
  },
  {
    id: "d0000000-0000-4000-8000-000000000005",
    citySlug: "otaru",
    name: "南樽市場",
    address: "北海道小樽市新富町12番1号",
    areaName: "新富町",
    category: "市場",
    lat: 43.1875,
    lng: 140.9925,
    status: "published",
    quietness: "quiet",
    reason: "観光客は三角市場へ行く。地元は南樽で買う。",
    visitFrequency: "weekly",
    authorId: "b0000000-0000-4000-8000-000000000007",
    photoUrl: null,
    publishedAtDaysAgo: 495,
    nextVerificationAtDaysAgo: -75,
    lastVerifiedAtDaysAgo: 15,
    createdAtDaysAgo: 500,
    tagSlugs: ["locals-market"],
  },
  {
    id: "d0000000-0000-4000-8000-000000000006",
    citySlug: "otaru",
    name: "鱗友朝市",
    address: "北海道小樽市色内3-10-15",
    areaName: "色内",
    category: "朝市",
    lat: 43.2004,
    lng: 140.9944,
    status: "published",
    quietness: "touristy",
    reason: "朝のうちに行くのが地元の流儀。昼が近づくほど観光バスが増える。",
    visitFrequency: "monthly",
    authorId: "b0000000-0000-4000-8000-000000000008",
    photoUrl: null,
    publishedAtDaysAgo: 590,
    nextVerificationAtDaysAgo: 5, // 既に期限超過（今から5日「前」に期限が来ていた。90日未満なのでまだ open）
    lastVerifiedAtDaysAgo: 95,
    createdAtDaysAgo: 600,
    tagSlugs: ["morning-only"],
  },
  {
    id: "d0000000-0000-4000-8000-000000000007",
    citySlug: "sapporo",
    name: "北24条の小さな喫茶店",
    address: "北海道札幌市北区北24条西4丁目",
    areaName: "北24条",
    category: "喫茶店",
    lat: 43.087,
    lng: 141.345,
    status: "pending",
    quietness: "quiet",
    reason: "通りから一本入った、近所の人が静かに過ごす喫茶店。",
    visitFrequency: "monthly",
    authorId: "b0000000-0000-4000-8000-000000000002",
    photoUrl: null,
    publishedAtDaysAgo: 0,
    nextVerificationAtDaysAgo: 0,
    lastVerifiedAtDaysAgo: 0,
    createdAtDaysAgo: 2,
    tagSlugs: [],
  },
  {
    // デモモード専用（架空）。デモ利用者 Aさん（札幌・大通）の投稿。
    // Spec §9.13.3: 回答できるのは期限（due_at）を過ぎた open の依頼だけなので、
    // 前回の確認から92日・期限を2日過ぎた状態にしてある（確認依頼 80000000-...-08。E2E の回答フローに使う）。
    id: "d0000000-0000-4000-8000-000000000008",
    citySlug: "sapporo",
    name: "大通の小さな定食屋",
    address: "北海道札幌市中央区大通西7丁目",
    areaName: "大通",
    category: "定食",
    lat: 43.0598,
    lng: 141.3462,
    status: "published",
    quietness: "crowding",
    reason: "昼どきは勤め人で埋まるが、二時を過ぎると近所の人だけになる。",
    visitFrequency: "weekly",
    authorId: "b0000000-0000-4000-8000-000000000004",
    photoUrl: null,
    publishedAtDaysAgo: 182,
    nextVerificationAtDaysAgo: 2,
    lastVerifiedAtDaysAgo: 92,
    createdAtDaysAgo: 190,
    tagSlugs: [],
  },
  {
    // デモモード専用（架空）。デモ利用者 Aさんの2件目の投稿。確認依頼 80000000-...-09 は期限前（75日後）で、
    // Spec §9.13.3「期限前の依頼には回答フォームを出さない」を E2E で確かめるのに使う。
    id: "d0000000-0000-4000-8000-000000000009",
    citySlug: "sapporo",
    name: "大通の古い蕎麦屋",
    address: "北海道札幌市中央区大通西9丁目",
    areaName: "大通",
    category: "蕎麦",
    lat: 43.0594,
    lng: 141.3431,
    status: "published",
    quietness: "crowding",
    reason: "昼は並ぶ。夕方の早い時間なら、まだ静かに手繰れる。",
    visitFrequency: "monthly",
    authorId: "b0000000-0000-4000-8000-000000000004",
    photoUrl: null,
    publishedAtDaysAgo: 110,
    nextVerificationAtDaysAgo: -75,
    lastVerifiedAtDaysAgo: 15,
    createdAtDaysAgo: 120,
    tagSlugs: [],
  },
];

// =========================================================
// 6. verification_requests（Spec §9.1）
//    published 到達時に1件作られる、という規則どおり、各 published スポットに
//    due_at = nextVerificationAtDaysAgo で1件だけ open（または既に missed）の依頼を用意する。
//    「同一スポットに open は高々1件」は生成ロジック自体が満たす（1スポット1件のみ生成）。
//    依頼IDの末尾12桁はスポットIDの末尾12桁と同じ（d...-04 → 80...-04）。
//    （seed.sql は確認履歴ごとに answered の依頼も作るが、フィクスチャの画面では使わないので持たない。）
// =========================================================
export const FIXTURE_VERIFICATION_REQUESTS: VerificationRequest[] = RAW_SPOTS.filter(
  (raw) => raw.status === "published",
).map((raw) => {
  const dueAt = offsetDaysISO(-raw.nextVerificationAtDaysAgo);
  const status: RequestStatus = isMissed(dueAt, new Date()) ? "missed" : "open";
  return {
    id: `80000000-0000-4000-8000-${raw.id.slice(-12)}`,
    spotId: raw.id,
    userId: raw.authorId,
    dueAt,
    status,
    answeredVerificationId: null,
    createdAt: offsetDaysISO(-raw.publishedAtDaysAgo),
  };
});

/** id で確認依頼を1件引く（mutations.ts / spots.ts が使う）。 */
export function findFixtureVerificationRequest(id: string): VerificationRequest | null {
  return FIXTURE_VERIFICATION_REQUESTS.find((r) => r.id === id) ?? null;
}

/** 対象スポットの open な確認依頼ID（無ければ null）。Spot.openRequestId の算出に使う。 */
function openRequestIdForSpot(spotId: string): string | null {
  const req = FIXTURE_VERIFICATION_REQUESTS.find((r) => r.spotId === spotId && r.status === "open");
  return req ? req.id : null;
}

// =========================================================
// 7. endorsements（架空：pending→published の同じ街2人承認）
//    FIXTURE_ENDORSEMENT_LOG は mutations.ts の endorseSpot が push する先でもある
//    （書き込みもインメモリに反映されるようにするため、配列参照ごと export する）。
// =========================================================
interface EndorsementLogEntry {
  spotId: string;
  userId: string;
  createdAt: string;
}

const RAW_ENDORSEMENTS: Array<{ spotId: string; userId: string; daysAgo: number }> = [
  // デモ画面で利用者が「最後の1人」として承認できる状態。
  { spotId: "d0000000-0000-4000-8000-000000000007", userId: "b0000000-0000-4000-8000-000000000005", daysAgo: 1 },
  { spotId: "d0000000-0000-4000-8000-000000000001", userId: "b0000000-0000-4000-8000-000000000004", daysAgo: 215 },
  { spotId: "d0000000-0000-4000-8000-000000000001", userId: "b0000000-0000-4000-8000-000000000005", daysAgo: 213 },
  { spotId: "d0000000-0000-4000-8000-000000000002", userId: "b0000000-0000-4000-8000-000000000001", daysAgo: 295 },
  { spotId: "d0000000-0000-4000-8000-000000000002", userId: "b0000000-0000-4000-8000-000000000004", daysAgo: 293 },
  { spotId: "d0000000-0000-4000-8000-000000000003", userId: "b0000000-0000-4000-8000-000000000004", daysAgo: 178 },
  { spotId: "d0000000-0000-4000-8000-000000000003", userId: "b0000000-0000-4000-8000-000000000005", daysAgo: 175 },
  { spotId: "d0000000-0000-4000-8000-000000000004", userId: "b0000000-0000-4000-8000-000000000009", daysAgo: 398 },
  { spotId: "d0000000-0000-4000-8000-000000000004", userId: "b0000000-0000-4000-8000-00000000000a", daysAgo: 395 },
  { spotId: "d0000000-0000-4000-8000-000000000005", userId: "b0000000-0000-4000-8000-000000000009", daysAgo: 498 },
  { spotId: "d0000000-0000-4000-8000-000000000005", userId: "b0000000-0000-4000-8000-000000000006", daysAgo: 495 },
  { spotId: "d0000000-0000-4000-8000-000000000006", userId: "b0000000-0000-4000-8000-00000000000a", daysAgo: 593 },
  { spotId: "d0000000-0000-4000-8000-000000000006", userId: "b0000000-0000-4000-8000-000000000007", daysAgo: 590 },
  // デモモード専用の架空店（札幌の住人の承認）
  { spotId: "d0000000-0000-4000-8000-000000000008", userId: "b0000000-0000-4000-8000-000000000001", daysAgo: 185 },
  { spotId: "d0000000-0000-4000-8000-000000000008", userId: "b0000000-0000-4000-8000-000000000005", daysAgo: 182 },
  { spotId: "d0000000-0000-4000-8000-000000000009", userId: "b0000000-0000-4000-8000-000000000001", daysAgo: 115 },
  { spotId: "d0000000-0000-4000-8000-000000000009", userId: "b0000000-0000-4000-8000-000000000005", daysAgo: 110 },
];

/** mutable: mutations.ts の endorseSpot がここへ push する。読み取りは endorsementCountForSpot 経由。 */
export const FIXTURE_ENDORSEMENT_LOG: EndorsementLogEntry[] = RAW_ENDORSEMENTS.map((e) => ({
  spotId: e.spotId,
  userId: e.userId,
  createdAt: offsetDaysISO(-e.daysAgo),
}));

export function hasFixtureEndorsement(spotId: string, userId: string): boolean {
  return FIXTURE_ENDORSEMENT_LOG.some((e) => e.spotId === spotId && e.userId === userId);
}

function endorsementCountForSpot(spotId: string): number {
  return FIXTURE_ENDORSEMENT_LOG.filter((e) => e.spotId === spotId).length;
}

// =========================================================
// 8. verifications（確認履歴）
//    鱗友朝市は quiet×2・touristy×2 の「時系列で新しい方が touristy」という例
//    （resolveQuietness は多数決をしないため、この店の現在値は単純に最新の touristy）。
//
//    シハチ鮮魚店/ザンギ本舗/輝風の各「直近バッチ」には、Spec §9.8/§1 が指定する
//    地元3人/5人/4人という人数に合わせて、投稿者以外の架空の確認者を追加している
//    （ファイル冒頭の注記のとおり、これは本番のRLSでは起こらないデモ専用データ）。
// =========================================================
interface RawVerification {
  id: string;
  spotId: string;
  userId: string;
  answer: Quietness;
  note: string | null;
  daysAgo: number;
}

const RAW_VERIFICATIONS: RawVerification[] = [
  { id: "c0000000-0000-4000-8000-000000000001", spotId: "d0000000-0000-4000-8000-000000000001", userId: "b0000000-0000-4000-8000-000000000001", answer: "quiet", note: null, daysAgo: 120 },
  { id: "c0000000-0000-4000-8000-000000000002", spotId: "d0000000-0000-4000-8000-000000000001", userId: "b0000000-0000-4000-8000-000000000001", answer: "quiet", note: null, daysAgo: 30 },
  { id: "c0000000-0000-4000-8000-000000000003", spotId: "d0000000-0000-4000-8000-000000000001", userId: "b0000000-0000-4000-8000-000000000001", answer: "quiet", note: "変わっていない", daysAgo: 3 },
  // シハチ鮮魚店: 架空の追加確認者2名（Aさん・Nさん）で直近バッチを計3人にする（Spec §1「3人」）。
  { id: "c0000000-0000-4000-8000-000000000014", spotId: "d0000000-0000-4000-8000-000000000001", userId: "b0000000-0000-4000-8000-000000000004", answer: "quiet", note: null, daysAgo: 3 },
  { id: "c0000000-0000-4000-8000-000000000015", spotId: "d0000000-0000-4000-8000-000000000001", userId: "b0000000-0000-4000-8000-000000000005", answer: "quiet", note: null, daysAgo: 3 },

  { id: "c0000000-0000-4000-8000-000000000004", spotId: "d0000000-0000-4000-8000-000000000002", userId: "b0000000-0000-4000-8000-000000000002", answer: "quiet", note: null, daysAgo: 200 },
  { id: "c0000000-0000-4000-8000-000000000005", spotId: "d0000000-0000-4000-8000-000000000002", userId: "b0000000-0000-4000-8000-000000000002", answer: "quiet", note: null, daysAgo: 110 },
  { id: "c0000000-0000-4000-8000-000000000006", spotId: "d0000000-0000-4000-8000-000000000002", userId: "b0000000-0000-4000-8000-000000000002", answer: "quiet", note: null, daysAgo: 5 },
  // 札幌ザンギ本舗: 架空の追加確認者4名で直近バッチを計5人にする（Spec §1「5人」）。
  { id: "c0000000-0000-4000-8000-000000000016", spotId: "d0000000-0000-4000-8000-000000000002", userId: "b0000000-0000-4000-8000-000000000001", answer: "quiet", note: null, daysAgo: 5 },
  { id: "c0000000-0000-4000-8000-000000000017", spotId: "d0000000-0000-4000-8000-000000000002", userId: "b0000000-0000-4000-8000-000000000003", answer: "quiet", note: null, daysAgo: 5 },
  { id: "c0000000-0000-4000-8000-000000000018", spotId: "d0000000-0000-4000-8000-000000000002", userId: "b0000000-0000-4000-8000-000000000004", answer: "quiet", note: null, daysAgo: 5 },
  { id: "c0000000-0000-4000-8000-000000000019", spotId: "d0000000-0000-4000-8000-000000000002", userId: "b0000000-0000-4000-8000-000000000005", answer: "quiet", note: null, daysAgo: 5 },

  { id: "c0000000-0000-4000-8000-000000000007", spotId: "d0000000-0000-4000-8000-000000000003", userId: "b0000000-0000-4000-8000-000000000003", answer: "quiet", note: null, daysAgo: 90 },
  { id: "c0000000-0000-4000-8000-000000000008", spotId: "d0000000-0000-4000-8000-000000000003", userId: "b0000000-0000-4000-8000-000000000003", answer: "crowding", note: "行列ができはじめた", daysAgo: 6 },
  // 札幌らーめん輝風: 架空の追加確認者3名で直近バッチを計4人にする（Spec §1「4人」）。
  { id: "c0000000-0000-4000-8000-00000000001a", spotId: "d0000000-0000-4000-8000-000000000003", userId: "b0000000-0000-4000-8000-000000000001", answer: "crowding", note: null, daysAgo: 6 },
  { id: "c0000000-0000-4000-8000-00000000001b", spotId: "d0000000-0000-4000-8000-000000000003", userId: "b0000000-0000-4000-8000-000000000002", answer: "crowding", note: null, daysAgo: 6 },
  { id: "c0000000-0000-4000-8000-00000000001c", spotId: "d0000000-0000-4000-8000-000000000003", userId: "b0000000-0000-4000-8000-000000000004", answer: "crowding", note: null, daysAgo: 6 },

  { id: "c0000000-0000-4000-8000-000000000009", spotId: "d0000000-0000-4000-8000-000000000004", userId: "b0000000-0000-4000-8000-000000000006", answer: "quiet", note: null, daysAgo: 300 },
  { id: "c0000000-0000-4000-8000-00000000000a", spotId: "d0000000-0000-4000-8000-000000000004", userId: "b0000000-0000-4000-8000-000000000006", answer: "quiet", note: null, daysAgo: 210 },
  { id: "c0000000-0000-4000-8000-00000000000b", spotId: "d0000000-0000-4000-8000-000000000004", userId: "b0000000-0000-4000-8000-000000000006", answer: "quiet", note: null, daysAgo: 40 },

  { id: "c0000000-0000-4000-8000-00000000000c", spotId: "d0000000-0000-4000-8000-000000000005", userId: "b0000000-0000-4000-8000-000000000007", answer: "quiet", note: null, daysAgo: 400 },
  { id: "c0000000-0000-4000-8000-00000000000d", spotId: "d0000000-0000-4000-8000-000000000005", userId: "b0000000-0000-4000-8000-000000000007", answer: "quiet", note: null, daysAgo: 300 },
  { id: "c0000000-0000-4000-8000-00000000000e", spotId: "d0000000-0000-4000-8000-000000000005", userId: "b0000000-0000-4000-8000-000000000007", answer: "quiet", note: null, daysAgo: 200 },
  { id: "c0000000-0000-4000-8000-00000000000f", spotId: "d0000000-0000-4000-8000-000000000005", userId: "b0000000-0000-4000-8000-000000000007", answer: "quiet", note: null, daysAgo: 15 },

  { id: "c0000000-0000-4000-8000-000000000010", spotId: "d0000000-0000-4000-8000-000000000006", userId: "b0000000-0000-4000-8000-000000000008", answer: "quiet", note: null, daysAgo: 500 },
  { id: "c0000000-0000-4000-8000-000000000011", spotId: "d0000000-0000-4000-8000-000000000006", userId: "b0000000-0000-4000-8000-000000000008", answer: "quiet", note: null, daysAgo: 350 },
  { id: "c0000000-0000-4000-8000-000000000012", spotId: "d0000000-0000-4000-8000-000000000006", userId: "b0000000-0000-4000-8000-000000000008", answer: "touristy", note: "観光バスを見かけるようになった", daysAgo: 100 },
  { id: "c0000000-0000-4000-8000-000000000013", spotId: "d0000000-0000-4000-8000-000000000006", userId: "b0000000-0000-4000-8000-000000000008", answer: "touristy", note: "昼はもう観光地", daysAgo: 95 },

  // デモモード専用の架空店（投稿者 Aさんの前回の確認）
  { id: "c0000000-0000-4000-8000-000000000020", spotId: "d0000000-0000-4000-8000-000000000008", userId: "b0000000-0000-4000-8000-000000000004", answer: "crowding", note: null, daysAgo: 92 },
  { id: "c0000000-0000-4000-8000-000000000021", spotId: "d0000000-0000-4000-8000-000000000009", userId: "b0000000-0000-4000-8000-000000000004", answer: "crowding", note: null, daysAgo: 15 },
];

// =========================================================
// 9. bookmarks（Spec §9.8 S8: シハチ鮮魚店／聖徳太子 飛鳥店／南樽市場／鱗友朝市の4件）
//    利用者は Task5 が採用した DEMO_USER_ID（Aさん＝b...0004）に合わせてある。
// =========================================================
interface RawBookmark {
  id: string;
  userId: string;
  spotId: string;
  plannedAtTomorrow: { hour: number; minute: number } | null;
  createdAtDaysAgo: number;
  meta?: string;
}

const RAW_BOOKMARKS: RawBookmark[] = [
  { id: "90000000-0000-4000-8000-000000000001", userId: "b0000000-0000-4000-8000-000000000004", spotId: "d0000000-0000-4000-8000-000000000001", plannedAtTomorrow: { hour: 12, minute: 30 }, createdAtDaysAgo: 2 },
  { id: "90000000-0000-4000-8000-000000000002", userId: "b0000000-0000-4000-8000-000000000004", spotId: "d0000000-0000-4000-8000-000000000004", plannedAtTomorrow: null, createdAtDaysAgo: 5, meta: "小樽駅から徒歩10分 / 日替わり定食" },
  { id: "90000000-0000-4000-8000-000000000003", userId: "b0000000-0000-4000-8000-000000000004", spotId: "d0000000-0000-4000-8000-000000000005", plannedAtTomorrow: null, createdAtDaysAgo: 8, meta: "小樽 / 地元が買いに行く市場" },
  { id: "90000000-0000-4000-8000-000000000004", userId: "b0000000-0000-4000-8000-000000000004", spotId: "d0000000-0000-4000-8000-000000000006", plannedAtTomorrow: null, createdAtDaysAgo: 12, meta: "小樽 / 朝のうちに" },
];

// =========================================================
// 解決済みデータ（Spot[] / Verification[] / Bookmark[]）
// =========================================================

function buildAuthorLabel(user: FixtureUser): string {
  return `${user.areaName}に${user.residentYears}年、${user.displayName}`;
}

/** mutable: mutations.ts の answerVerification がここへ push する。 */
export const FIXTURE_VERIFICATIONS: Verification[] = RAW_VERIFICATIONS.map((v) => ({
  id: v.id,
  spotId: v.spotId,
  userId: v.userId,
  answer: v.answer,
  note: v.note,
  createdAt: offsetDaysISO(-v.daysAgo),
}));

function verificationsForSpot(spotId: string): Verification[] {
  return FIXTURE_VERIFICATIONS.filter((v) => v.spotId === spotId);
}

/** 直近の確認「回」に参加した人数（同じ最新日時から24時間以内に記録された確認の人数）。 */
function verifierCountForSpot(spotId: string): number {
  const list = verificationsForSpot(spotId);
  if (list.length === 0) return 0;
  const latest = Math.max(...list.map((v) => new Date(v.createdAt).getTime()));
  const dayMs = 24 * 60 * 60 * 1000;
  const uniqueUsers = new Set(
    list.filter((v) => latest - new Date(v.createdAt).getTime() < dayMs).map((v) => v.userId),
  );
  return uniqueUsers.size;
}

function toSpot(raw: RawSpot): Spot {
  const city = findCitySlug(raw.citySlug);
  const author = findUser(raw.authorId);
  const tags = raw.tagSlugs.map((slug) => {
    const tag = FIXTURE_TAGS.find((t) => t.slug === slug);
    if (!tag) throw new Error(`fixture tag not found: ${slug}`);
    return tag;
  });

  return {
    id: raw.id,
    cityId: city.id,
    citySlug: city.slug,
    cityName: city.name,
    name: raw.name,
    areaName: raw.areaName,
    address: raw.address,
    category: raw.category,
    lat: raw.lat,
    lng: raw.lng,
    status: raw.status,
    // 正本は spots.quietness（実DBと同じ）。確認履歴との一致は fixtures.test.ts で検証する。
    quietness: raw.quietness,
    reason: raw.reason,
    hoverDescription: raw.hoverDescription ?? null,
    visitFrequency: raw.visitFrequency,
    authorId: raw.authorId,
    authorLabel: buildAuthorLabel(author),
    photoUrl: raw.photoUrl,
    tags,
    endorsementCount: endorsementCountForSpot(raw.id),
    verifierCount: verifierCountForSpot(raw.id),
    lastVerifiedAt: offsetDaysISO(-raw.lastVerifiedAtDaysAgo),
    nextVerificationAt: offsetDaysISO(-raw.nextVerificationAtDaysAgo),
    publishedAt: offsetDaysISO(-raw.publishedAtDaysAgo),
    createdAt: offsetDaysISO(-raw.createdAtDaysAgo),
    // distanceMeters/walkMinutes はクエリ時（origin または街の中心）に spots.ts が埋める。
    // ここでは未装飾の状態として null を持つ。
    distanceMeters: null,
    walkMinutes: null,
    openRequestId: openRequestIdForSpot(raw.id),
  };
}

/** mutable: mutations.ts の createSpot / endorseSpot / answerVerification がここへ push・mutate する。 */
export const FIXTURE_SPOTS: Spot[] = RAW_SPOTS.map(toSpot);

export function findFixtureSpot(id: string): Spot | undefined {
  return FIXTURE_SPOTS.find((s) => s.id === id);
}

function findSpot(id: string): Spot {
  const spot = findFixtureSpot(id);
  if (!spot) throw new Error(`fixture spot not found: ${id}`);
  return spot;
}

/** mutable: mutations.ts の addBookmark / removeBookmark がここへ push・splice する。 */
export const FIXTURE_BOOKMARKS: Bookmark[] = RAW_BOOKMARKS.map((b) => {
  const plannedAt = b.plannedAtTomorrow
    ? nextDayAtTokyoTime(new Date(), b.plannedAtTomorrow.hour, b.plannedAtTomorrow.minute).toISOString()
    : null;
  return {
    id: b.id,
    userId: b.userId,
    spotId: b.spotId,
    plannedAt,
    createdAt: offsetDaysISO(-b.createdAtDaysAgo),
    meta: b.meta ?? null,
    spot: findSpot(b.spotId),
  };
});

/**
 * 住んでいる街を設定・変更する（mutations.ts の setUserHomeCity のデモ経路）。
 * DB 関数 set_home_city（0007_home_city_change_limit.sql、SPEC §9.16）と同じ規則・同じ文言:
 *   - 存在しない街は拒否。
 *   - 未設定 → 設定（初回は制限に数えない。変更時刻も消す。戻り値 null）。
 *   - 同じ街 → 何もしない（記録済みの変更時刻を返す）。
 *   - 別の街 → 未変更か90日以上前の変更なら変えて今の時刻を記録・返す。90日以内なら拒否。
 */
export function setFixtureUserHomeCity(userId: string, cityId: string): string | null {
  const user = FIXTURE_USERS.find((u) => u.id === userId);
  if (!user) throw new Error("プロフィールが見つかりませんでした");
  const city = findCityById(cityId);
  if (!city) throw new Error("街の情報が取得できませんでした");
  const changedAt = user.homeCityChangedAt ?? null;

  if (user.homeCitySlug === null) {
    // 初回設定は数えない。「街だけ未設定・変更時刻あり」でも古い制限が残らないよう時刻も消す（DB と同じ）。
    user.homeCitySlug = city.slug;
    user.homeCityChangedAt = null;
    return null;
  }
  if (user.homeCitySlug === city.slug) return changedAt;

  const now = new Date();
  if (!canChangeHomeCity(changedAt, now)) {
    const next = nextHomeCityChangeAt(changedAt);
    if (next) throw new Error(homeCityLimitMessage(next));
  }
  user.homeCitySlug = city.slug;
  user.homeCityChangedAt = now.toISOString();
  return user.homeCityChangedAt;
}

/**
 * 住んでいる街の初回設定（mutations.ts の initializeUserHomeCity のデモ経路。/start の「歩きはじめる」専用）。
 * DB 関数 initialize_home_city（0007_home_city_change_limit.sql、SPEC §9.16-1）と同じ規則:
 *   - 存在しない街は拒否。
 *   - 未設定なら設定して true（初回は制限に数えない。変更時刻も消す）。
 *   - 設定済み（またはデモ利用者でない）なら何もせず false（例外にしない）。
 */
export function initializeFixtureUserHomeCity(userId: string, cityId: string): boolean {
  const city = findCityById(cityId);
  if (!city) throw new Error("街の情報が取得できませんでした");
  const user = FIXTURE_USERS.find((u) => u.id === userId);
  // 「行が無い」と「既に設定済み」を同じ false に畳まない（R14 軽微1。0007 の initialize_home_city と同じ規則）。
  if (!user) throw new Error("プロフィールが見つかりません");
  if (user.homeCitySlug !== null) return false;
  user.homeCitySlug = city.slug;
  user.homeCityChangedAt = null;
  return true;
}

/**
 * テスト用: 住んでいる街と変更時刻を直接書き換える（未設定の利用者や「街だけ未設定・変更時刻あり」の行を作るため）。
 * resetFixtureUserHomeCities で初期値に戻る。アプリのコードからは呼ばない。
 */
export function overrideFixtureUserHomeCityForTest(
  userId: string,
  homeCitySlug: string | null,
  homeCityChangedAt: string | null,
): void {
  const user = FIXTURE_USERS.find((u) => u.id === userId);
  if (!user) throw new Error("プロフィールが見つかりませんでした");
  user.homeCitySlug = homeCitySlug;
  user.homeCityChangedAt = homeCityChangedAt;
}

/** 全ユーザーの居住街（と変更時刻）を初期値に戻す（テスト間のリセット用）。 */
export function resetFixtureUserHomeCities(): void {
  for (const user of FIXTURE_USERS) {
    user.homeCitySlug = INITIAL_HOME_CITY_SLUGS.get(user.id) ?? null;
    user.homeCityChangedAt = INITIAL_HOME_CITY_CHANGED_AT.get(user.id) ?? null;
  }
}

export function fixtureUserHomeCitySlug(userId: string): string | null {
  const user = FIXTURE_USERS.find((u) => u.id === userId);
  return user ? user.homeCitySlug : null;
}

/** ユーザーの居住街ID（endorseSpot の「同じ街のユーザーのみ承認可」判定に使う）。 */
export function fixtureUserHomeCityId(userId: string): string | null {
  const user = FIXTURE_USERS.find((u) => u.id === userId);
  if (!user || user.homeCitySlug === null) return null;
  return findCitySlug(user.homeCitySlug).id;
}

/** CONTRACT追補 getUserProfile のフィクスチャ実装が使う。 */
export function fixtureUserProfile(userId: string): UserProfile | null {
  const user = FIXTURE_USERS.find((u) => u.id === userId);
  if (!user) return null;
  const city = user.homeCitySlug === null ? null : findCitySlug(user.homeCitySlug);
  return {
    id: user.id,
    displayName: user.displayName,
    homeCityId: city ? city.id : null,
    homeCityChangedAt: user.homeCityChangedAt ?? null,
    areaName: user.areaName,
    residentYears: user.residentYears,
    avatarUrl: null,
    lanternPoints: user.lanternPoints,
    createdAt: offsetDaysISO(-user.createdAtDaysAgo),
  };
}

// =========================================================
// 10. lantern_events（ポイント台帳。Spec §9.13.4）
//     DB の `unique (kind, source_id)` と同じく、(kind, sourceId) につき一度だけ記録・加算する。
// =========================================================
export type LanternEventKind = "verification" | "publish";

export interface FixtureLanternEvent {
  userId: string;
  kind: LanternEventKind;
  /** verification なら verification_request_id、publish なら spot_id。 */
  sourceId: string;
  points: number;
  createdAt: string;
}

/** mutable: awardFixtureLanternPoints だけが push する。 */
export const FIXTURE_LANTERN_EVENTS: FixtureLanternEvent[] = [];

/**
 * 台帳へ記録できたときだけ灯りポイントを加算し、加算した点数を返す（既に記録済みなら0）。
 * DB 側の award_lantern_points（0006）と同じ規則。
 */
export function awardFixtureLanternPoints(
  userId: string,
  kind: LanternEventKind,
  sourceId: string,
  points: number,
  now: Date,
): number {
  if (points <= 0) return 0;
  if (FIXTURE_LANTERN_EVENTS.some((event) => event.kind === kind && event.sourceId === sourceId)) return 0;
  const user = FIXTURE_USERS.find((candidate) => candidate.id === userId);
  if (!user) throw new Error(`fixture user not found: ${userId}`);
  FIXTURE_LANTERN_EVENTS.push({ userId, kind, sourceId, points, createdAt: now.toISOString() });
  user.lanternPoints += points;
  return points;
}

/** CONTRACT追補 getProfileStats のフィクスチャ実装が使う集計値。 */
export function fixtureProfileStats(userId: string): {
  spotsCreated: number;
  verificationsAnswered: number;
  spotsKeptQuiet: number;
  pendingRequestCount: number;
  winterVerificationCount: number;
  publishedPortSpotCount: number;
} {
  const authored = FIXTURE_SPOTS.filter((s) => s.authorId === userId);
  const verifications = FIXTURE_VERIFICATIONS.filter((v) => v.userId === userId);
  // Spec §9.13.3: 「確認待ち」は回答できる依頼（期限到来済みの open ＋ 復帰できる最新の missed）だけ。
  const ownRequests = FIXTURE_VERIFICATION_REQUESTS.filter(
    (r) => r.userId === userId && (r.status === "open" || r.status === "missed"),
  ).flatMap((r) => {
    const spot = FIXTURE_SPOTS.find((s) => s.id === r.spotId);
    return spot ? [{ ...r, spotStatus: spot.status }] : [];
  });
  return {
    spotsCreated: authored.length,
    verificationsAnswered: verifications.length,
    spotsKeptQuiet: authored.filter((s) => s.status === "published" && s.quietness === "quiet").length,
    pendingRequestCount: countAnswerableRequests(ownRequests, new Date()),
    // 日本時間の暦月で12〜2月（domain/lantern.ts）。
    winterVerificationCount: verifications.filter((v) => isWinterMonth(v.createdAt)).length,
    publishedPortSpotCount: authored.filter((s) => s.status === "published" && findCityById(s.cityId)?.isPort).length,
  };
}

export function fixtureSpotsByAuthor(userId: string): Spot[] {
  return FIXTURE_SPOTS.filter((s) => s.authorId === userId);
}

export { findCityById as fixtureCityById };

// =========================================================
// お問い合わせ（SPEC §9.17）
// デモモードには DB が無いため、0010_contact_hardening.sql の submit_contact_message と同じ規則を
// インメモリで再現するだけにする（プロセスが終われば消える。どこにも保存しない）。
// 送信元ごと・全体の回数制限と容量の上限は再現しない（デモには送信元のハッシュもソルトも無い）。
// =========================================================

export interface FixtureContactMessage {
  id: string;
  createdAt: string;
  category: "removal" | "correction" | "privacy" | "other";
  message: string;
  replyTo: string | null;
  spotId: string | null;
  requesterId: string | null;
  userAgent: string | null;
  status: "new" | "in_progress" | "done";
}

/** mutable: addFixtureContactMessage だけが push する。 */
export const FIXTURE_CONTACT_MESSAGES: FixtureContactMessage[] = [];

/**
 * 問い合わせを1件受け付ける（DB 関数 submit_contact_message と同じ規則）。
 * 戻り値は作った id。直近1分以内に同じ送信（用件・本文・対象の店・返信先・送信者が同一）があれば作らず null。
 * privacy（個人情報の請求）は送信者（requesterId）が無ければ拒否する。
 * 入力の形式検査は呼び出し元（src/lib/db/contact.ts の validateContactMessageInput）が済ませている。
 */
export function addFixtureContactMessage(
  input: {
    category: "removal" | "correction" | "privacy" | "other";
    message: string;
    replyTo: string | null;
    spotId: string | null;
    requesterId: string | null;
    userAgent: string | null;
  },
  now: Date,
): string | null {
  if (input.category === "privacy" && input.requesterId === null) {
    throw new Error("ログインしてから送ってください。本人確認のためです。");
  }
  if (input.spotId !== null) {
    const spot = FIXTURE_SPOTS.find((s) => s.id === input.spotId && s.status === "published");
    if (!spot) throw new Error("お店の情報が取得できませんでした");
  }
  const oneMinuteAgo = now.getTime() - 60_000;
  const duplicated = FIXTURE_CONTACT_MESSAGES.some(
    (m) =>
      m.category === input.category &&
      m.message === input.message &&
      m.spotId === input.spotId &&
      m.replyTo === input.replyTo &&
      m.requesterId === input.requesterId &&
      new Date(m.createdAt).getTime() > oneMinuteAgo,
  );
  if (duplicated) return null;

  const id = crypto.randomUUID();
  FIXTURE_CONTACT_MESSAGES.push({
    id,
    createdAt: now.toISOString(),
    category: input.category,
    message: input.message,
    replyTo: input.replyTo,
    spotId: input.spotId,
    requesterId: input.requesterId,
    userAgent: input.userAgent,
    status: "new",
  });
  return id;
}

/** 保存期間（受付から1年ちょうど）を過ぎた問い合わせを削除し、削除した件数を返す（DB 関数 purge_expired_contact_data と同じ規則）。 */
export function purgeFixtureContactMessages(now: Date): number {
  const limit = new Date(now);
  limit.setUTCFullYear(limit.getUTCFullYear() - 1);
  const before = FIXTURE_CONTACT_MESSAGES.length;
  const kept = FIXTURE_CONTACT_MESSAGES.filter((m) => new Date(m.createdAt).getTime() > limit.getTime());
  FIXTURE_CONTACT_MESSAGES.splice(0, FIXTURE_CONTACT_MESSAGES.length, ...kept);
  return before - kept.length;
}
