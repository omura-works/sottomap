// 静けさ判定（Spec §9.2。§2.1の「多数決」は廃止）
//
// RLS上、verifications に答えられるのは対象スポットの投稿者だけである
// （src/app/actions/spot-verify.ts・supabase/migrations/0002_rls.sql 参照）。
// したがって複数人の多数決は成立しない。
//
// 現在の静けさ ＝ 最後に受理された確認（verifications の中で最も createdAt が新しいもの）の回答。
// 確認が一度も無ければ fallback（投稿時の申告値。既定 quiet）。

import type { Quietness, Verification } from "../db/types";

export function resolveQuietness(
  verifications: Verification[],
  fallback: Quietness = "quiet",
): Quietness {
  if (verifications.length === 0) {
    return fallback;
  }

  // 最も新しい createdAt を持つ確認の回答を採る。
  // 同時刻タイの場合は配列の並び順で最初に出会ったものを安定して採用する
  // （reduce は左から評価するため、同値では先勝ち＝呼び出し側の並び順に対して決定的）。
  const latest = verifications.reduce((acc, v) =>
    new Date(v.createdAt).getTime() > new Date(acc.createdAt).getTime() ? v : acc,
  );
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
