/**
 * MVPの「現在のユーザー」を表す仮の識別子とプロフィール値。
 *
 * 認証（Task 6）が未結線のため、本タスク（T5）では単一の仮ユーザーとして
 * 動作させる。`docs/CONTRACT.md` にはユーザープロフィール取得関数や
 * 「投稿者ごとのスポット一覧」取得関数が定義されていないため、
 * 数値・バッジ・投稿一覧は SPEC §4 S7 のモックに合わせたフォールバック値を使う
 * （SPEC §7 により、確認人数・灯りポイント・バッジ等の数値はもともと
 * UI上の架空データと明記されているため、この扱いと矛盾しない）。
 *
 * Task 6 が認証を結線する際、`DEMO_USER_ID` を実ユーザーIDに、
 * `DEMO_PROFILE` 以下をプロフィール取得関数の実データに差し替える想定。
 *
 * `DEMO_USER_ID` は `supabase/seed.sql` / `src/lib/db/fixtures.ts` に実在する
 * ユーザーの UUID を指す（`users`/`bookmarks` 等のFK制約を満たし、seed/フィクスチャで
 * そのまま動作確認できるようにするため）。栞（bookmarks）のフィクスチャは
 * 「Aさん」（`b...004`、札幌・大通・9年）にのみ紐づいているため、S8 `/bookmarks` が
 * 空にならないようこちらを採用している。S7 `/me` のプロフィール表示（「Kさん」）は
 * `DEMO_PROFILE` の固定値を使うのみで `DEMO_USER_ID` には連動しない
 * （CONTRACT にユーザーIDから取得するプロフィール関数が無いため）。
 */
export const DEMO_USER_ID = "b0000000-0000-4000-8000-000000000004";

export const DEMO_PROFILE = {
  displayName: "Kさん",
  areaName: "北24条",
  residentYears: 14,
  avatarUrl: null as string | null,
  // 立てたピン / 確認した回数 / 静けさを守った店（SPEC §4 S7の例値。架空データ）
  postedSpotCount: 18,
  verificationCount: 64,
  keptQuietSpotCount: 15,
  // lantern.ts の resolveBadges() に渡すための入力（架空データ）
  winterVerificationCount: 5,
  publishedPortSpotCount: 0,
  pendingVerificationCount: 2,
} as const;

/**
 * 「あなたが書いた店」フォールバック一覧。
 * 店名は SPEC §7 に列挙された実在店舗のみを使用する（架空店名は使わない）。
 * quietness は表示用の仮値（この場のデモとしては quiet 固定）。
 */
export const DEMO_AUTHORED_SPOTS = [
  { name: "シハチ鮮魚店 北24条店", quietness: "quiet" as const },
  { name: "札幌ザンギ本舗", quietness: "quiet" as const },
];
