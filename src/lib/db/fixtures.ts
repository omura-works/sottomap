// Supabase 実インスタンス未接続時のフォールバック・フィクスチャ。
//
// supabase/seed.sql と同じ内容（街8件・タグ8件・実在6店・確認履歴・承認・栞）を
// インメモリの TypeScript オブジェクトとして持つ。他タスク（T3〜T5）が画面を作れるよう、
// src/lib/db/spots.ts の各関数は Supabase 環境変数が無いときに自動でここへフォールバックする。
//
// 実在店データの出典は supabase/seed.sql のコメントと同じ（docs/SPEC.md §7）。
// 確認人数・承認・灯りポイント等はゲームメカニクス上の架空デモ値。

import { resolveQuietness } from "../domain/quietness";
import type { Badge, Bookmark, City, Quietness, Spot, SpotStatus, Tag, VisitFrequency, Verification } from "./types";

/** now() ± n日 の ISO8601 文字列。n>0 で未来、n<0 で過去（seed.sql の interval 表記に対応）。 */
function offsetDaysISO(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// =========================================================
// 1. cities
// =========================================================
export const FIXTURE_CITIES: City[] = [
  { id: "a0000000-0000-4000-8000-000000000001", slug: "sapporo", name: "札幌", nameKana: "さっぽろ", isPort: false, centerLat: 43.0621, centerLng: 141.3544, defaultZoom: 12.5 },
  { id: "a0000000-0000-4000-8000-000000000002", slug: "otaru", name: "小樽", nameKana: "おたる", isPort: true, centerLat: 43.1907, centerLng: 140.9947, defaultZoom: 13.5 },
  { id: "a0000000-0000-4000-8000-000000000003", slug: "hakodate", name: "函館", nameKana: "はこだて", isPort: true, centerLat: 41.7687, centerLng: 140.7288, defaultZoom: 13.5 },
  { id: "a0000000-0000-4000-8000-000000000004", slug: "asahikawa", name: "旭川", nameKana: "あさひかわ", isPort: false, centerLat: 43.7706, centerLng: 142.3649, defaultZoom: 13 },
  { id: "a0000000-0000-4000-8000-000000000005", slug: "furano", name: "富良野", nameKana: "ふらの", isPort: false, centerLat: 43.3416, centerLng: 142.3831, defaultZoom: 13 },
  { id: "a0000000-0000-4000-8000-000000000006", slug: "kushiro", name: "釧路", nameKana: "くしろ", isPort: true, centerLat: 42.9849, centerLng: 144.382, defaultZoom: 13 },
  { id: "a0000000-0000-4000-8000-000000000007", slug: "obihiro", name: "帯広", nameKana: "おびひろ", isPort: false, centerLat: 42.9238, centerLng: 143.1968, defaultZoom: 13 },
  { id: "a0000000-0000-4000-8000-000000000008", slug: "wakkanai", name: "稚内", nameKana: "わっかない", isPort: true, centerLat: 45.4155, centerLng: 141.6733, defaultZoom: 13.5 },
];

// =========================================================
// 2. tags
// =========================================================
export const FIXTURE_TAGS: Tag[] = [
  { id: "e0000000-0000-4000-8000-000000000001", slug: "fish-shop-direct", label: "魚屋直営", kind: "accent" },
  { id: "e0000000-0000-4000-8000-000000000002", slug: "takeout-ok", label: "持ち帰りもできる", kind: "neutral" },
  { id: "e0000000-0000-4000-8000-000000000003", slug: "night-only", label: "夜が本番", kind: "accent2" },
  { id: "e0000000-0000-4000-8000-000000000004", slug: "locals-market", label: "地元が買いに行く市場", kind: "accent2" },
  { id: "e0000000-0000-4000-8000-000000000005", slug: "morning-only", label: "朝のうちに", kind: "accent2" },
  { id: "e0000000-0000-4000-8000-000000000006", slug: "day-only", label: "昼だけ", kind: "accent2" },
  { id: "e0000000-0000-4000-8000-000000000007", slug: "cash-only", label: "現金のみ", kind: "neutral" },
  { id: "e0000000-0000-4000-8000-000000000008", slug: "solo-ok", label: "ひとりで入れる", kind: "neutral" },
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
  homeCitySlug: string;
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

// =========================================================
// 5. spots（実在6店。座標・住所・カテゴリは supabase/seed.sql と同じ実データ）
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
  initialQuietness: Quietness;
  reason: string;
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
    initialQuietness: "quiet",
    reason: "魚屋が営む丼屋。地元の値段のまま出てくるから、観光の店より一枚が厚い。",
    visitFrequency: "monthly",
    authorId: "b0000000-0000-4000-8000-000000000001",
    photoUrl: null,
    publishedAtDaysAgo: 213,
    nextVerificationAtDaysAgo: -87,
    lastVerifiedAtDaysAgo: 3,
    createdAtDaysAgo: 220,
    tagSlugs: ["fish-shop-direct"],
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
    initialQuietness: "quiet",
    reason: "ザンギは唐揚げではない、と地元は言う。持ち帰りもできるから、宿に戻ってからも食べられる。",
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
    initialQuietness: "quiet",
    reason: "夜のすすきので、地元が最後に寄る一杯。行列ができはじめたのはここ最近。",
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
    initialQuietness: "quiet",
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
    initialQuietness: "quiet",
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
    initialQuietness: "touristy",
    reason: "朝のうちに行くのが地元の流儀。昼が近づくほど観光バスが増える。",
    visitFrequency: "monthly",
    authorId: "b0000000-0000-4000-8000-000000000008",
    photoUrl: null,
    publishedAtDaysAgo: 590,
    nextVerificationAtDaysAgo: 5, // 既に期限超過（今から5日「前」に期限が来ていた）
    lastVerifiedAtDaysAgo: 95,
    createdAtDaysAgo: 600,
    tagSlugs: ["morning-only"],
  },
];

// =========================================================
// 6. endorsements（架空：pending→published の同じ街2人承認）
// =========================================================
interface RawEndorsement {
  spotId: string;
  userId: string;
  daysAgo: number;
}

const RAW_ENDORSEMENTS: RawEndorsement[] = [
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
];

// =========================================================
// 7. verifications（架空：90日ごとの確認履歴）
//    鱗友朝市は quiet×2・touristy×2 の同数タイ（新しい方の touristy を採用する例）。
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

  { id: "c0000000-0000-4000-8000-000000000004", spotId: "d0000000-0000-4000-8000-000000000002", userId: "b0000000-0000-4000-8000-000000000002", answer: "quiet", note: null, daysAgo: 200 },
  { id: "c0000000-0000-4000-8000-000000000005", spotId: "d0000000-0000-4000-8000-000000000002", userId: "b0000000-0000-4000-8000-000000000002", answer: "quiet", note: null, daysAgo: 110 },
  { id: "c0000000-0000-4000-8000-000000000006", spotId: "d0000000-0000-4000-8000-000000000002", userId: "b0000000-0000-4000-8000-000000000002", answer: "quiet", note: null, daysAgo: 5 },

  { id: "c0000000-0000-4000-8000-000000000007", spotId: "d0000000-0000-4000-8000-000000000003", userId: "b0000000-0000-4000-8000-000000000003", answer: "quiet", note: null, daysAgo: 90 },
  { id: "c0000000-0000-4000-8000-000000000008", spotId: "d0000000-0000-4000-8000-000000000003", userId: "b0000000-0000-4000-8000-000000000003", answer: "crowding", note: "行列ができはじめた", daysAgo: 6 },

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
];

// =========================================================
// 8. bookmarks（架空：Aさんがいくつか栞している）
// =========================================================
interface RawBookmark {
  id: string;
  userId: string;
  spotId: string;
  plannedAtDaysFromNow: number | null; // 時刻付きの場合は別途 hoursOffset を足す
  plannedAtHoursOffset?: number;
  createdAtDaysAgo: number;
}

const RAW_BOOKMARKS: RawBookmark[] = [
  { id: "9000000-0000-4000-8000-000000000001", userId: "b0000000-0000-4000-8000-000000000004", spotId: "d0000000-0000-4000-8000-000000000001", plannedAtDaysFromNow: 1, plannedAtHoursOffset: 12.5, createdAtDaysAgo: 2 },
  { id: "9000000-0000-4000-8000-000000000002", userId: "b0000000-0000-4000-8000-000000000004", spotId: "d0000000-0000-4000-8000-000000000002", plannedAtDaysFromNow: null, createdAtDaysAgo: 10 },
  { id: "9000000-0000-4000-8000-000000000003", userId: "b0000000-0000-4000-8000-000000000004", spotId: "d0000000-0000-4000-8000-000000000004", plannedAtDaysFromNow: null, createdAtDaysAgo: 5 },
];

// =========================================================
// 解決済みデータ（Spot[] / Verification[] / Bookmark[]）
// =========================================================

function buildAuthorLabel(user: FixtureUser): string {
  return `${user.areaName}に${user.residentYears}年、${user.displayName}`;
}

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

function endorsementCountForSpot(spotId: string): number {
  return RAW_ENDORSEMENTS.filter((e) => e.spotId === spotId).length;
}

/** 直近の確認「回」に参加した人数（同じ最新日時に記録された確認の人数）。 */
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
  const verifications = verificationsForSpot(raw.id);
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
    quietness: resolveQuietness(verifications, raw.initialQuietness),
    reason: raw.reason,
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
  };
}

export const FIXTURE_SPOTS: Spot[] = RAW_SPOTS.map(toSpot);

function findSpot(id: string): Spot {
  const spot = FIXTURE_SPOTS.find((s) => s.id === id);
  if (!spot) throw new Error(`fixture spot not found: ${id}`);
  return spot;
}

export const FIXTURE_BOOKMARKS: Bookmark[] = RAW_BOOKMARKS.map((b) => {
  const plannedAt =
    b.plannedAtDaysFromNow === null
      ? null
      : offsetDaysISO(b.plannedAtDaysFromNow + (b.plannedAtHoursOffset ?? 0) / 24);
  return {
    id: b.id,
    userId: b.userId,
    spotId: b.spotId,
    plannedAt,
    createdAt: offsetDaysISO(-b.createdAtDaysAgo),
    spot: findSpot(b.spotId),
  };
});

export function fixtureUserHomeCitySlug(userId: string): string | null {
  const user = FIXTURE_USERS.find((u) => u.id === userId);
  return user ? user.homeCitySlug : null;
}
