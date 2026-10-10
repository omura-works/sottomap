import { NextResponse } from "next/server";
import { purgeExpiredAccountDeletionLog } from "@/lib/db/account-deletion";
import { purgeExpiredContactData } from "@/lib/db/contact";
import { runVerificationCron } from "@/lib/db/mutations";
import { isPublicDemo } from "@/lib/supabase/env";
import { isAuthorizedCronRequest } from "./authorize";

export const dynamic = "force-dynamic";

/**
 * 90日検証の定期処理 `src/app/api/cron/verification/route.ts`。
 * `vercel.json` の Cron 設定から呼ばれる想定。`CRON_SECRET` の Bearer 認可が無いと 401。
 * Supabase 経路では DB 関数 run_verification_cron（service_role 専用）が行ロック下で次を行う。
 *
 * - pending は期限（created_at + 30日）までの承認が2人なら published、足りなければ期限後に expired
 * - open 依頼が due_at から90日経過したら missed、対象スポットを dormant
 * - open 依頼が無い published スポットには次回依頼を1件作る
 *
 * 続いて、保存期間を過ぎたお問い合わせを削除する（SPEC §9.17。DB 関数 purge_expired_contact_data、
 * service_role 専用）。問い合わせは受付から1年、送信元の記録は24時間。
 * 最後に、退会から30日（バックアップの保存期間）を過ぎた退会の記録を削除する（SPEC §9.17。
 * DB 関数 purge_expired_account_deletion_log、service_role 専用）。
 * 削除に失敗したら console.error に記録し 500 を返す（ほかの処理は続け、その結果は返す。翌日の実行で取り戻せる）。
 */
export async function GET(request: Request) {
  // 公開デモでは定期処理を動かさない（データは起動ごとのフィクスチャで、消す・期限を進める物が無い）
  if (isPublicDemo()) return NextResponse.json({ error: "not available in the public demo" }, { status: 404 });
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const result = await runVerificationCron(now);
  let failed = false;

  let contactPurge: Awaited<ReturnType<typeof purgeExpiredContactData>> | { error: "failed" };
  try {
    contactPurge = await purgeExpiredContactData(now);
  } catch (error) {
    failed = true;
    contactPurge = { error: "failed" };
    console.error(
      `[cron] お問い合わせの保存期間の処理に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let accountDeletionLogPurge: Awaited<ReturnType<typeof purgeExpiredAccountDeletionLog>> | { error: "failed" };
  try {
    accountDeletionLogPurge = await purgeExpiredAccountDeletionLog();
  } catch (error) {
    failed = true;
    accountDeletionLogPurge = { error: "failed" };
    console.error(
      `[cron] 退会の記録の保存期間の処理に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return NextResponse.json({ ...result, contactPurge, accountDeletionLogPurge }, { status: failed ? 500 : 200 });
}
