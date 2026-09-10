// 灯り（ポイント／バッジ）Spec §2.5

import type { Badge } from "../db/types";

export const POINTS_PER_VERIFICATION = 5;
export const POINTS_PER_PUBLISHED_SPOT = 10;

export const KEEPER_BADGE_THRESHOLD = 20; // 確認20回
export const WINTER_BADGE_THRESHOLD = 5; // 冬（12〜2月）に確認5回
export const PORT_BADGE_THRESHOLD = 3; // 港町の街で公開ピン3件

export interface LanternInput {
  verificationCount: number;
  winterVerificationCount: number; // 12〜2月の確認回数
  publishedPortSpotCount: number;
  publishedSpotCount: number;
}

export function totalPoints(input: LanternInput): number {
  return (
    input.verificationCount * POINTS_PER_VERIFICATION +
    input.publishedSpotCount * POINTS_PER_PUBLISHED_SPOT
  );
}

interface BadgeDefinition {
  slug: Badge["slug"];
  glyph: string;
  label: string;
  threshold: number;
  count: (input: LanternInput) => number;
}

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    slug: "keeper",
    glyph: "灯",
    label: "番人",
    threshold: KEEPER_BADGE_THRESHOLD,
    count: (input) => input.verificationCount,
  },
  {
    slug: "winter",
    glyph: "雪",
    label: "冬も歩いた",
    threshold: WINTER_BADGE_THRESHOLD,
    count: (input) => input.winterVerificationCount,
  },
  {
    slug: "port",
    glyph: "港",
    label: "港",
    threshold: PORT_BADGE_THRESHOLD,
    count: (input) => input.publishedPortSpotCount,
  },
];

/** 未取得バッジもグレー表示で見せるため、常に全バッジを返す（「あと N 件」用に remaining を添える）。 */
export function resolveBadges(input: LanternInput): Badge[] {
  return BADGE_DEFINITIONS.map((def) => {
    const count = def.count(input);
    const earned = count >= def.threshold;
    return {
      id: def.slug,
      slug: def.slug,
      glyph: def.glyph,
      label: def.label,
      earned,
      remaining: Math.max(def.threshold - count, 0),
    };
  });
}

/**
 * CONTRACT には無い追加ヘルパー（append only）。
 * ある日時が「冬（12〜2月）」の確認かどうかを判定する。
 * src/lib/db/spots.ts が verifications から LanternInput.winterVerificationCount を
 * 集計する際に使う。
 */
export function isWinterMonth(date: string | Date): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  // UTC基準で判定する（ローカルタイムゾーンによって日付がずれるのを避けるため）。
  const month = d.getUTCMonth() + 1; // 1-12
  return month === 12 || month === 1 || month === 2;
}

/**
 * 冪等なポイント付与（Spec §9.6・CONTRACT追補）。
 * 確認 +5 は verification_requests.id につき一度だけ。
 * 呼び出し側（mutations.ts）は「付与済みの requestId 一覧」を都度渡し、
 * 既に付与済みなら 0 を返す（Cron再実行・回答の再送で二重加算しない）。
 */
export function pointsForAnswer(alreadyAwardedRequestIds: string[], requestId: string): number {
  return alreadyAwardedRequestIds.includes(requestId) ? 0 : POINTS_PER_VERIFICATION;
}

/**
 * 冪等なポイント付与（Spec §9.6・CONTRACT追補）。
 * 公開 +10 は spots.id につき一度だけ（published_at が初めて入るときのみ）。
 * 呼び出し側は「更新前の published_at が null だったか」を渡す。
 */
export function pointsForPublish(publishedAtWasNull: boolean): number {
  return publishedAtWasNull ? POINTS_PER_PUBLISHED_SPOT : 0;
}
