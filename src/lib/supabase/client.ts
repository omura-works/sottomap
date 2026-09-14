"use client";

// ブラウザ（Client Component）用の Supabase クライアント生成。
// UIからの直接利用は避け、可能な限り src/lib/db/** のデータアクセス関数を経由すること。
// ブラウザには URASUPO_DEMO_MODE / VERCEL_ENV が届かないため、実行モードの判定（./env.ts）は使わず、
// 公開用の2つの環境変数だけを見る。どちらかが欠けていれば例外（fail-closed）。

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error(
      "Supabase の環境変数（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）が未設定です。",
    );
  }
  return createBrowserClient(url, anonKey);
}
