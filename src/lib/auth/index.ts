import { isDemoMode } from "../supabase/env";
import { createClient } from "../supabase/server";
import { DEMO_USER_ID } from "./constants";

/**
 * サーバー側の唯一のユーザーID取得口。
 * デモモード（URASUPO_DEMO_MODE=1 を明示したときだけ。Spec §9.13.1）ではデモユーザー、
 * それ以外は検証済みセッションのユーザーを返す。Supabase の設定が欠けていればデモに落とさず例外。
 */
export async function getCurrentUserId(): Promise<string | null> {
  if (isDemoMode()) return DEMO_USER_ID;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user?.id ?? null;
}
