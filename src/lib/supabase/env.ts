// Supabase 接続情報の有無を判定するヘルパー。
// 実DBインスタンスが未接続の環境（このリポジトリの開発時点）では
// src/lib/db/spots.ts がここを見て seed.sql 相当のインメモリ・フィクスチャへ
// フォールバックする。

export function getSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}
