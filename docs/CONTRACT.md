# 共有インターフェース契約（Contract）

並行して作業する全エージェントは、**このファイルの型と関数シグネチャを唯一の共有面**とする。
Task 2 がこれを実装し、Task 3〜5 はこれを import して使う。
**シグネチャを勝手に変えない。** 足りなければ追加のみ（既存を変更しない）。

配置: すべて `src/lib/` 配下。パスは以下のとおり固定。

---

## `src/lib/db/types.ts`

```ts
export type Quietness = 'quiet' | 'crowding' | 'touristy';
export type SpotStatus = 'pending' | 'published' | 'dormant' | 'expired';
export type VisitFrequency = 'weekly' | 'monthly' | 'yearly';
export type TagKind = 'accent' | 'accent2' | 'neutral' | 'outline';
export type TimeOfDay = 'morning' | 'day' | 'night'; // 朝 / 昼 / 夜

export interface City {
  id: string;
  slug: string;          // 'sapporo' | 'otaru' | 'hakodate' | 'asahikawa' | 'furano' | 'kushiro' | 'obihiro' | 'wakkanai'
  name: string;          // '札幌'
  nameKana: string;
  isPort: boolean;
  centerLat: number;
  centerLng: number;
  defaultZoom: number;
}

export interface Tag {
  id: string;
  slug: string;
  label: string;         // '魚屋直営'
  kind: TagKind;
}

export interface UserProfile {
  id: string;
  displayName: string;       // 'Kさん'
  homeCityId: string | null;
  homeCityChangedAt: string | null; // 住んでいる街を最後に変えた時刻（初回設定は数えない）。SPEC §9.16
  areaName: string | null;   // '北24条'
  residentYears: number | null;
  avatarUrl: string | null;
  lanternPoints: number;
  createdAt: string;         // ISO8601
}

export interface Spot {
  id: string;
  cityId: string;
  citySlug: string;
  cityName: string;          // '札幌'
  name: string;              // 'シハチ鮮魚店 北24条店'
  areaName: string | null;   // '北24条'
  address: string | null;
  category: string | null;   // '海鮮丼'
  lat: number;
  lng: number;
  status: SpotStatus;
  quietness: Quietness;
  reason: string;            // 60字まで
  visitFrequency: VisitFrequency;
  authorId: string;
  authorLabel: string | null;   // '— 北24条に14年、Kさん' の後半部分 '北24条に14年、Kさん'
  photoUrl: string | null;
  tags: Tag[];
  endorsementCount: number;     // 承認した人数
  verifierCount: number;        // 直近の確認に参加した人数（表示用）
  lastVerifiedAt: string | null;
  nextVerificationAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

// 2026-09-24 追補（SPEC §9.18-2・0012）: 公開される列だけ。回答者のID（userId）と備考（note）は外した。
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
  plannedAt: string | null;  // '明日 12:30' 相当の実日時
  createdAt: string;
  spot: Spot;
}

export interface Badge {
  id: string;
  slug: 'keeper' | 'winter' | 'port';
  glyph: string;       // '灯' | '雪' | '港'
  label: string;       // '番人' | '冬も歩いた' | '港'
  earned: boolean;
  remaining: number;   // 未取得なら「あと N 件」
}
```

---

## `src/lib/domain/quietness.ts`

```ts
import type { Quietness, Verification } from '../db/types';

/** 確認履歴から現在の静けさを決める。同数なら新しい方を採る。履歴が空なら fallback。 */
export function resolveQuietness(
  verifications: Verification[],
  fallback: Quietness = 'quiet',
): Quietness;

/** UI表示ラベル: quiet→'静かなまま' / crowding→'並びはじめた' / touristy→'もう観光地になった' */
export function quietnessLabel(q: Quietness): string;
```

## `src/lib/domain/ordering.ts`

```ts
import type { Spot } from '../db/types';

/** Spec §2.4 の並び順。distances は spotId → メートル。距離不明は Infinity 扱い。 */
export function compareSpots(
  a: Spot, b: Spot, distances?: Record<string, number>,
): number;

export function sortSpots(
  spots: Spot[], distances?: Record<string, number>,
): Spot[];
```

## `src/lib/domain/lifecycle.ts`

```ts
import type { Spot, SpotStatus } from '../db/types';

export const ENDORSEMENTS_REQUIRED = 2;
export const VERIFICATION_INTERVAL_DAYS = 90;
export const DORMANT_AFTER_DAYS = 180;   // 期限からさらに90日
export const PENDING_EXPIRY_DAYS = 30;

/** pending のスポットが公開条件を満たしたか（投稿者自身の承認は除外済みの数を渡す） */
export function canPublish(endorsementCount: number): boolean;

/** 次に取るべき状態。変化不要なら現在の status をそのまま返す。 */
export function nextStatus(
  spot: Pick<Spot, 'status' | 'createdAt' | 'nextVerificationAt'>,
  endorsementCount: number,
  now: Date,
): SpotStatus;

/** 確認に答えた/公開された時点からの次回確認日 */
export function nextVerificationDate(from: Date): Date;

/** '前回の確認から92日' の 92 を出す */
export function daysSince(from: string | Date, now: Date): number;
```

## `src/lib/domain/lantern.ts`

```ts
import type { Badge } from '../db/types';

export const POINTS_PER_VERIFICATION = 5;
export const POINTS_PER_PUBLISHED_SPOT = 10;

export interface LanternInput {
  verificationCount: number;
  winterVerificationCount: number;   // 12〜2月の確認回数
  publishedPortSpotCount: number;
  publishedSpotCount: number;
}

export function totalPoints(input: LanternInput): number;
export function resolveBadges(input: LanternInput): Badge[];
```

---

## `src/lib/db/spots.ts`（データアクセス）

```ts
import type { Spot, City, Verification, Bookmark } from './types';

export interface SpotQuery {
  citySlug: string;
  q?: string;                 // 検索語
  filters?: string[];         // タグ slug: 'quiet-now' | 'day-only' | 'cash-only' | 'solo-ok' | 'within-10min'
  origin?: { lat: number; lng: number };
  limit?: number;
}

export function listCities(): Promise<City[]>;
export function getCity(slug: string): Promise<City | null>;

/** 必ず sortSpots を通して返す。status='published' のみ。 */
export function listSpots(query: SpotQuery): Promise<Spot[]>;
export function getSpot(id: string): Promise<Spot | null>;
export function listVerifications(spotId: string): Promise<Verification[]>;

/** 承認待ち（同じ街のユーザーにだけ見せる） */
export function listPendingSpots(citySlug: string, viewerId: string): Promise<Spot[]>;

export function listBookmarks(userId: string): Promise<Bookmark[]>;
export function countPublishedSpots(citySlug: string): Promise<number>;
export function countQuietSpots(citySlug: string, areaName?: string): Promise<number>;

/** 「今週、静けさが確認された店」— 直近7日に確認があった店を確認人数つきで */
export function listRecentlyVerified(
  citySlug: string, limit?: number,
): Promise<Array<{ spot: Spot; verifierCount: number }>>;
```

---

## UIコンポーネント（Task 1 が提供、Task 3〜5 が使用）

すべて `src/components/ui/` から named export。

```ts
Button:  { variant?: 'primary'|'secondary'|'ghost'; block?: boolean } & ButtonHTMLAttributes
Tag:     { kind?: TagKind; as?: 'span'|'button'; selected?: boolean } & HTMLAttributes
Card:    { kicker?: ReactNode; title?: ReactNode; meta?: ReactNode; elevation?: 'sm'|'md'|'lg' }
Input:   InputHTMLAttributes
Field:   { label: string; maxLength?: number; value?: string; hint?: ReactNode }  // maxLength指定で文字数カウンタ表示
Segment: { options: Array<{value: string; label: string}>; value: string; onChange(v: string): void }
Dialog:  { open: boolean; title: ReactNode; onClose(): void }
Divider: {}
```

---

## ファイル所有権（並行作業時の衝突防止）

| タスク | 書いてよい場所 |
|---|---|
| T1 | `package.json`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/ui/**`, `src/app/styleguide/**`, 設定ファイル全般 |
| T2 | `supabase/**`, `src/lib/**` |
| T3 | `src/components/map/**`, `src/app/[city]/page.tsx`, `src/app/[city]/search/**`, `src/components/spot-list/**` |
| T4 | `src/app/[city]/spots/new/**`, `src/app/verify/**`, `src/app/api/cron/**`, `src/components/spot-form/**`, `src/app/actions/spot-*.ts` |
| T5 | `src/app/start/**`, `src/app/[city]/spots/[id]/**`, `src/app/me/**`, `src/app/bookmarks/**`, `src/components/profile/**`, `src/app/actions/bookmark-*.ts` |
| T6 | 認証まわり `src/lib/auth/**`, `src/app/(auth)/**`, README、および全体の結線修正 |

**他タスクの所有領域を書き換えない。** 必要なら報告に「T2 の `listSpots` に引数追加が必要」と書く。
`package.json` は T1 が全依存を先に入れるので、以降のタスクは触らない。

---

# 追補（2026-09-09・SPEC §9 に対応。既存定義に優先する）

## 型の追加・変更 — `src/lib/db/types.ts`

```ts
export type RequestStatus = 'open' | 'answered' | 'missed';

export interface VerificationRequest {
  id: string;
  spotId: string;
  userId: string;          // 依頼先＝投稿者
  dueAt: string;           // ISO8601
  status: RequestStatus;
  answeredVerificationId: string | null;
  createdAt: string;
}

/** Spot に追加するフィールド */
// distanceMeters: number | null;   // 原点が与えられたときの距離
// walkMinutes:    number | null;   // 「徒歩7分」表示用（距離から算出、80m/分）
// openRequestId:  string | null;   // open の確認依頼ID（あれば）
```

## `src/lib/domain/lifecycle.ts` — 定数と関数の改訂

```ts
export const ENDORSEMENTS_REQUIRED = 2;
export const VERIFICATION_INTERVAL_DAYS = 90;
export const DORMANT_AFTER_DUE_DAYS = 90;   // due_at を90日超過したら missed→dormant
export const PENDING_EXPIRY_DAYS = 30;
// DORMANT_AFTER_DAYS は廃止

/** 日時ベースの遷移のみを判定する（回答イベントは扱わない） */
export function nextStatus(
  spot: Pick<Spot, 'status' | 'createdAt'>,
  openRequest: Pick<VerificationRequest, 'dueAt' | 'status'> | null,
  endorsementCount: number,
  now: Date,
): SpotStatus;

/** 確認に答えたときの遷移。dormant からの復帰はここが担う。 */
export function statusAfterAnswer(current: SpotStatus): SpotStatus;

/** 依頼が missed 扱いになるか */
export function isMissed(dueAt: string | Date, now: Date): boolean;
```

## `src/lib/domain/ordering.ts` — 比較キーの明確化

```ts
/** SPEC §9.5: 静けさ順位 → 距離 → 最終確認日時(降順) → id(昇順) */
export function compareSpots(a: Spot, b: Spot, distances?: Record<string, number>): number;
```

## `src/lib/domain/lantern.ts` — 冪等性

```ts
/** 確認+5 は requestId につき一度、公開+10 は spotId につき一度。
 *  付与済みを判定できるよう、加算は必ずこの関数を通す。 */
export function pointsForAnswer(alreadyAwardedRequestIds: string[], requestId: string): number;
export function pointsForPublish(publishedAtWasNull: boolean): number;
```

## `src/lib/db/` — 追加が必要な取得関数

```ts
// 確認依頼
export function getVerificationRequest(id: string): Promise<VerificationRequest | null>;
export function listOpenRequests(userId: string): Promise<VerificationRequest[]>;

// プロフィール
export function getUserProfile(userId: string): Promise<UserProfile | null>;
export function getProfileStats(userId: string): Promise<{
  spotsCreated: number; verificationsAnswered: number; spotsKeptQuiet: number;
  pendingRequestCount: number; winterVerificationCount: number; publishedPortSpotCount: number;
}>;
export function listSpotsByAuthor(userId: string): Promise<Spot[]>;
```

## `src/lib/db/mutations.ts` — 書き込み系（新規・T4の暫定実装をここへ集約）

```ts
export function createSpot(input: {
  cityId: string; name: string; reason: string; lat: number; lng: number;
  visitFrequency: VisitFrequency; authorId: string;
}): Promise<Spot>;

export function endorseSpot(spotId: string, userId: string): Promise<{ published: boolean }>;

export function answerVerification(
  requestId: string, userId: string, answer: Quietness, note?: string,
): Promise<{ pointsAwarded: number; status: SpotStatus }>;

export function addBookmark(userId: string, spotId: string, plannedAt?: string): Promise<Bookmark>;
export function removeBookmark(userId: string, spotId: string): Promise<void>;
```

## ファイル所有権（修正波では無効）

修正波は単一のエージェントが全域を担当する。所有権表は並行実行時のみ有効。
