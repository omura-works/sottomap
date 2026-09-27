// そっとマップ 共有ドメイン型
// docs/CONTRACT.md の型定義をそのまま実装する。並行作業する全タスクの共有面のため、
// ここのシグネチャ・フィールド名は変更しない（足りなければ追加のみ）。

export type Quietness = "quiet" | "crowding" | "touristy";
export type SpotStatus = "pending" | "published" | "dormant" | "expired";
export type VisitFrequency = "weekly" | "monthly" | "yearly";
export type TagKind = "accent" | "accent2" | "neutral" | "outline";
export type TimeOfDay = "morning" | "day" | "night"; // 朝 / 昼 / 夜

/** 確認依頼（verification_request）の状態。Spec §9.1。 */
export type RequestStatus = "open" | "answered" | "missed";

export interface City {
  id: string;
  slug: string; // 'sapporo' | 'otaru' | 'hakodate' | 'asahikawa' | 'furano' | 'kushiro' | 'obihiro' | 'wakkanai'
  name: string; // '札幌'
  nameKana: string;
  isPort: boolean;
  centerLat: number;
  centerLng: number;
  defaultZoom: number;
  /**
   * 街の代表エリア名（S2/D1見出し「札幌・北24条」の後半部分）。CONTRACT追補（2026-09-09）。
   * §9.12-7: 表示スポットの最頻エリアから推定すると実データ次第で意図しないエリアになる
   * （例: 「札幌・すすきの」）ため、街ごとに固定値を持たせる。無ければ市区町村名のみ表示。
   */
  featuredArea: string | null;
}

export interface Tag {
  id: string;
  slug: string;
  label: string; // '魚屋直営'
  kind: TagKind;
}

export interface UserProfile {
  id: string;
  displayName: string; // 'Kさん'
  homeCityId: string | null;
  /** 住んでいる街を最後に変えた時刻（初回設定は数えない）。null = 未変更。SPEC §9.16 */
  homeCityChangedAt: string | null;
  // エリア・居住年数は集めない・表示しない（SPEC §9.18-2、R21 軽微3）。DB の users.area_name・resident_years の列は残るが読まない。
  avatarUrl: string | null;
  lanternPoints: number;
  createdAt: string; // ISO8601
}

export interface Spot {
  id: string;
  cityId: string;
  citySlug: string;
  cityName: string; // '札幌'
  name: string; // 'シハチ鮮魚店 北24条店'
  areaName: string | null; // '北24条'
  address: string | null;
  category: string | null; // '海鮮丼'
  lat: number;
  lng: number;
  status: SpotStatus;
  quietness: Quietness;
  reason: string; // 60字まで
  /** D1ホバーカード専用の説明。未設定時は reason を表示する。 */
  hoverDescription?: string | null;
  visitFrequency: VisitFrequency;
  authorId: string;
  authorLabel: string | null; // 署名 '— Kさん' の後半部分 'Kさん'（表示名だけ。SPEC §9.18-2）
  photoUrl: string | null;
  tags: Tag[];
  endorsementCount: number; // 承認した人数
  verifierCount: number; // 直近の確認に参加した人数（表示用）
  lastVerifiedAt: string | null;
  nextVerificationAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  /** origin（無ければ街の中心）からの距離。CONTRACT追補。 */
  distanceMeters: number | null;
  /** 「徒歩7分」表示用（distanceMeters から80m/分換算、切り上げ・最低1分）。CONTRACT追補。 */
  walkMinutes: number | null;
  /** open状態の確認依頼ID（あれば）。CONTRACT追補・Spec §9.1。 */
  openRequestId: string | null;
}

/** 90日ごとの確認依頼。Spec §9.1。`/verify/[requestId]` の requestId はこの id。 */
export interface VerificationRequest {
  id: string;
  spotId: string;
  userId: string; // 依頼先＝投稿者
  dueAt: string; // ISO8601
  status: RequestStatus;
  answeredVerificationId: string | null;
  createdAt: string;
}

/**
 * 確認の回答（公開される列だけ）。SPEC §9.18-2（0012）: 回答者のID（user_id）と備考（note）は公開しない。
 * 店ごとの人数は集計 RPC、本人の実績は本人専用 RPC で取る（src/lib/db/spots.ts）。
 */
export interface Verification {
  id: string;
  spotId: string;
  answer: Quietness;
  createdAt: string;
}

export interface Bookmark {
  id: string;
  userId: string;
  spotId: string;
  plannedAt: string | null; // '明日 12:30' 相当の実日時
  createdAt: string;
  /** S8で使う栞固有のメタ文言。未設定時はスポット情報から組み立てる。 */
  meta?: string | null;
  spot: Spot;
}

export interface Badge {
  id: string;
  slug: "keeper" | "winter" | "port";
  glyph: string; // '灯' | '雪' | '港'
  label: string; // '番人' | '冬も歩いた' | '港'
  earned: boolean;
  remaining: number; // 未取得なら「あと N 件」
}
