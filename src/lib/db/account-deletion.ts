// 退会の記録（public.account_deletion_log、0015_name_context_and_deletion_log.sql。docs/SPEC.md §9.17）。
//
// 退会（運営用 RPC delete_account）のたびに、消したアカウントの ID と日時を記録する。
// バックアップから戻したときに、記録にあるアカウントを reapply_account_deletions() で再び削除するため。
// バックアップの保存期間（30日）を過ぎた記録は要らないので、日次の cron が purge_expired_account_deletion_log で消す。
// デモモード（URASUPO_DEMO_MODE=1）には退会が無いので、記録も無い。

import { isSupabaseConfigured } from "../supabase/env";
import { createServiceRoleClient } from "../supabase/server";

export interface AccountDeletionLogPurgeResult {
  /** 削除した退会の記録の件数。 */
  deletedLogs: number;
}

/**
 * 退会から30日を過ぎた記録を削除する。Supabase 経路では DB 関数 purge_expired_account_deletion_log
 * （service_role 専用、DB の now() を使う）を呼ぶ。
 */
export async function purgeExpiredAccountDeletionLog(): Promise<AccountDeletionLogPurgeResult> {
  if (!isSupabaseConfigured()) {
    return { deletedLogs: 0 };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("purge_expired_account_deletion_log");
  if (error) throw new Error(`退会の記録の削除に失敗しました: ${error.message}`);
  if (typeof data !== "number") {
    throw new Error("退会の記録の削除の結果を読み取れませんでした");
  }
  return { deletedLogs: data };
}
