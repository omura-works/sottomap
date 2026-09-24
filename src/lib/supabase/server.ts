// サーバー（Server Component / Route Handler / Server Action）用の Supabase クライアント生成。
// "server-only" パッケージは package.json に無いため使わない（誤ってクライアント側から
// import した場合は next/headers 側のビルドエラーで検出される）。
// Next.js 16 では next/headers の cookies() が Promise を返すため await する。
// デモモード（Spec §9.13.1）では Supabase に接続しないため例外を投げる。設定の矛盾も ./env.ts が例外にする。
// UIからの直接利用は避け、可能な限り src/lib/db/** のデータアクセス関数を経由すること。

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

export async function createClient(): Promise<SupabaseClient> {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error("デモモードでは Supabase のクライアントを作れません（src/lib/db/** はフィクスチャを使います）。");
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

/**
 * service role の接続。RLS を通らないため、使う場所を次の2つに限る。
 * - cron（run_verification_cron と、保存期間を過ぎた問い合わせの削除）（Spec §9.13.2）
 * - お問い合わせの保存（submit_contact_message は anon・authenticated から直接実行できないため、
 *   サーバーの Server Action からだけ呼ぶ。Spec §9.17）
 * - 表示名の変更（set_display_name(p_user_id, p_name) は anon・authenticated から直接実行できない。
 *   Server Action が本人の ID をサーバー側で確かめ〈auth.getUser〉、アプリの検査を通した名前だけを渡す。
 *   利用者が RPC を直接呼んでアプリの検査を回避できないようにするため。Spec §9.18-1、R23 重要1、0016）
 * - 退会の記録の整理（purge_expired_account_deletion_log。cron から。Spec §9.17）
 * それ以外の利用者の操作（承認・確認・投稿・住んでいる街）は本人のセッション（createClient）で DB 関数を呼ぶ。
 */
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
