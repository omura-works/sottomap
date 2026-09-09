"use client";

// ブラウザ（Client Component）用の Supabase クライアント生成。
// 環境変数が無い場合は例外を投げる。UIからの直接利用は避け、
// 可能な限り src/lib/db/** のデータアクセス関数を経由すること。

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

export function createClient(): SupabaseClient {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase の環境変数（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）が未設定です。" +
        " src/lib/db/** はこの状態でもフォールバックのフィクスチャで動作しますが、" +
        " createClient() を直接呼ぶコードはこの例外を処理してください。",
    );
  }
  return createBrowserClient(env.url, env.anonKey);
}
