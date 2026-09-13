import { isSupabaseConfigured } from "../supabase/env";
import { createClient } from "../supabase/server";
import { DEMO_USER_ID } from "./constants";

/**
 * サーバー側の唯一のユーザーID取得口。
 * Supabase未設定時はデモユーザー、設定済みなら検証済みセッションのユーザーを返す。
 */
export async function getCurrentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return DEMO_USER_ID;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user?.id ?? null;
}
