// 並び順（Spec §9.5。§2.4を置き換える完全な比較キー）
// 1. 静けさ順位   quiet(0) < crowding(1) < touristy(2)
// 2. 距離         近い順（不明は Infinity）
// 3. 最終確認日時 新しい順（未確認は最も古い扱い）
// 4. id           昇順（同値時の決定性を保証）
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

  // 距離: 明示の distances を優先し、無ければ Spot に埋まっている distanceMeters。どちらも無ければ Infinity。
  const distA = distances?.[a.id] ?? a.distanceMeters ?? Infinity;
  const distB = distances?.[b.id] ?? b.distanceMeters ?? Infinity;
  if (distA !== distB) {
    return distA - distB;
  }

  // 最終確認が新しい順（未確認は最も古い扱い）。
  const lastA = a.lastVerifiedAt ? new Date(a.lastVerifiedAt).getTime() : -Infinity;
  const lastB = b.lastVerifiedAt ? new Date(b.lastVerifiedAt).getTime() : -Infinity;
  if (lastA !== lastB) {
    return lastB - lastA;
  }

  // id 昇順（同値時の決定性を保証）。
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function sortSpots(
  spots: Spot[],
  distances?: Record<string, number>,
): Spot[] {
  return [...spots].sort((a, b) => compareSpots(a, b, distances));
}

/**
 * SPEC §9.14-5: 「まだ静か」チップON時の表示分割。
 * quiet の店と、crowding/touristy（「混みはじめた店」の下にまとめる分）に分ける。
 * spots は既に sortSpots を通した順のため、各グループ内の相対順は保たれる。
 */
export function splitByQuietness(spots: Spot[]): { quiet: Spot[]; crowded: Spot[] } {
  return {
    quiet: spots.filter((s) => s.quietness === "quiet"),
    crowded: spots.filter((s) => s.quietness !== "quiet"),
  };
}
