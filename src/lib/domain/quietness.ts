// 静けさ判定（Spec §2.1）
// 直近の確認履歴の多数決で現在の静けさを決める。同数なら「新しい方」を採る。
// 履歴が空なら fallback（投稿時の申告値。既定 quiet）。

import type { Quietness, Verification } from "../db/types";

const QUIETNESS_VALUES: Quietness[] = ["quiet", "crowding", "touristy"];

export function resolveQuietness(
  verifications: Verification[],
  fallback: Quietness = "quiet",
): Quietness {
  if (verifications.length === 0) {
    return fallback;
  }

  const counts: Record<Quietness, number> = {
    quiet: 0,
    crowding: 0,
    touristy: 0,
  };
  for (const v of verifications) {
    counts[v.answer] += 1;
  }

  const maxCount = Math.max(...QUIETNESS_VALUES.map((q) => counts[q]));
  const leaders = QUIETNESS_VALUES.filter((q) => counts[q] === maxCount);

  if (leaders.length === 1) {
    return leaders[0];
  }

  // 同数タイ: 最も新しい確認の回答を採用する。
  const newest = [...verifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  return newest.answer;
}

export function quietnessLabel(q: Quietness): string {
  switch (q) {
    case "quiet":
      return "静かなまま";
    case "crowding":
      return "並びはじめた";
    case "touristy":
      return "もう観光地になった";
  }
}
