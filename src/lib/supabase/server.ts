// サーバー（Server Component / Route Handler / Server Action）用の Supabase クライアント生成。
// "server-only" パッケージは package.json に無いため使わない（誤ってクライアント側から
// import した場合は next/headers 側のビルドエラーで検出される）。
// Next.js 16 では next/headers の cookies() が Promise を返すため await する。
// 環境変数が無い場合は例外を投げる。UIからの直接利用は避け、
// 可能な限り src/lib/db/** のデータアクセス関数を経由すること。

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

export async function createClient(): Promise<SupabaseClient> {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase の環境変数（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）が未設定です。" +
        " src/lib/db/** はこの状態でもフォールバックのフィクスチャで動作しますが、" +
        " createClient() を直接呼ぶコードはこの例外を処理してください。",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component からの呼び出しでは cookie を書けない場合がある。
          // セッションのリフレッシュは Proxy が担うため無視してよい。
        }
      },
    },
  });
}

/** RLS が service role 専用にしている cron・状態遷移の書き込みにだけ使う。 */
export function createServiceRoleClient(): SupabaseClient {
  const env = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !serviceRoleKey) {
    throw new Error("Supabase の service role 環境変数（SUPABASE_SERVICE_ROLE_KEY）が未設定です。");
  }
  return createSupabaseClient(env.url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
