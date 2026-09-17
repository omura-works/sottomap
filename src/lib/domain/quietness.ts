// 静けさ判定（Spec §9.2。§2.1の「多数決」は廃止）
//
// RLS上、verifications に答えられるのは対象スポットの投稿者だけである
// （src/app/actions/spot-verify.ts・supabase/migrations/0002_rls.sql 参照）。
// したがって複数人の多数決は成立しない。
//
// 現在の静けさ ＝ 最後に受理された確認（verifications の中で最も createdAt が新しいもの）の回答。
// 確認が一度も無ければ fallback（投稿時の申告値。既定 quiet）。
//
// 正本について（Spec §9.13.2）: 実DBでは answer_verification が回答と同じトランザクションで
// spots.quietness を更新するので、画面に出す値は spots.quietness を正本とする（src/lib/db/spots.ts）。
// この関数は「確認履歴から求めた値」と正本が一致することを検証するためのドメイン規則として残す。

import type { Quietness, Verification } from "../db/types";

/** 同時刻タイのときに採る順（混雑を見落とさない側を優先する）。 */
const TIE_PRIORITY: Record<Quietness, number> = {
  touristy: 2,
  crowding: 1,
  quiet: 0,
};

function isNewer(candidate: Verification, current: Verification): boolean {
  const diff = new Date(candidate.createdAt).getTime() - new Date(current.createdAt).getTime();
  if (diff !== 0) return diff > 0;
  // 同時刻タイ: 入力の並び順に依存させない。
  // 1. 混雑側（touristy > crowding > quiet）を採る  2. それでも同じなら id の大きい方。
  const priorityDiff = TIE_PRIORITY[candidate.answer] - TIE_PRIORITY[current.answer];
  if (priorityDiff !== 0) return priorityDiff > 0;
  return candidate.id > current.id;
}

export function resolveQuietness(
  verifications: Verification[],
  fallback: Quietness = "quiet",
): Quietness {
  if (verifications.length === 0) {
    return fallback;
  }
  const latest = verifications.reduce((acc, v) => (isNewer(v, acc) ? v : acc));
  return latest.answer;
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
