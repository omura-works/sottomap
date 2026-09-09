// 並び順（Spec §2.4）
// 1. quiet のスポット（新しい確認があるものほど上）
// 2. crowding
// 3. touristy
// 同一ステータス内は「距離が近い順」。距離が取れない場合は「最終確認が新しい順」。
// この優先順を一覧を返すすべての経路（src/lib/db/spots.ts）で必ず適用する。

import type { Quietness, Spot } from "../db/types";

const STATUS_RANK: Record<Quietness, number> = {
  quiet: 0,
  crowding: 1,
  touristy: 2,
};

export function compareSpots(
  a: Spot,
  b: Spot,
  distances?: Record<string, number>,
): number {
  const rankDiff = STATUS_RANK[a.quietness] - STATUS_RANK[b.quietness];
  if (rankDiff !== 0) {
    return rankDiff;
  }

  // 距離不明は Infinity 扱い。
  const distA = distances?.[a.id] ?? Infinity;
  const distB = distances?.[b.id] ?? Infinity;
  if (distA !== distB) {
    return distA - distB;
  }

  // 最終確認が新しい順（未確認は最も古い扱い）。
  const lastA = a.lastVerifiedAt ? new Date(a.lastVerifiedAt).getTime() : -Infinity;
  const lastB = b.lastVerifiedAt ? new Date(b.lastVerifiedAt).getTime() : -Infinity;
  return lastB - lastA;
}

export function sortSpots(
  spots: Spot[],
  distances?: Record<string, number>,
): Spot[] {
  return [...spots].sort((a, b) => compareSpots(a, b, distances));
}
