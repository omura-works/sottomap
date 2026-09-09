// ウラスポ 共有ドメイン型
// docs/CONTRACT.md の型定義をそのまま実装する。並行作業する全タスクの共有面のため、
// ここのシグネチャ・フィールド名は変更しない（足りなければ追加のみ）。

export type Quietness = "quiet" | "crowding" | "touristy";
export type SpotStatus = "pending" | "published" | "dormant" | "expired";
export type VisitFrequency = "weekly" | "monthly" | "yearly";
export type TagKind = "accent" | "accent2" | "neutral" | "outline";
export type TimeOfDay = "morning" | "day" | "night"; // 朝 / 昼 / 夜

export interface City {
  id: string;
  slug: string; // 'sapporo' | 'otaru' | 'hakodate' | 'asahikawa' | 'furano' | 'kushiro' | 'obihiro' | 'wakkanai'
  name: string; // '札幌'
  nameKana: string;
  isPort: boolean;
  centerLat: number;
  centerLng: number;
  defaultZoom: number;
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
  areaName: string | null; // '北24条'
  residentYears: number | null;
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
  visitFrequency: VisitFrequency;
  authorId: string;
  authorLabel: string | null; // '— 北24条に14年、Kさん' の後半部分 '北24条に14年、Kさん'
  photoUrl: string | null;
  tags: Tag[];
  endorsementCount: number; // 承認した人数
  verifierCount: number; // 直近の確認に参加した人数（表示用）
  lastVerifiedAt: string | null;
  nextVerificationAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface Verification {
  id: string;
  spotId: string;
  userId: string;
  answer: Quietness;
  note: string | null;
  createdAt: string;
}

export interface Bookmark {
  id: string;
  userId: string;
  spotId: string;
  plannedAt: string | null; // '明日 12:30' 相当の実日時
  createdAt: string;
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
