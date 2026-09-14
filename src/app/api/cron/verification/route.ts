import { NextResponse } from "next/server";
import { runVerificationCron } from "@/lib/db/mutations";
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
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  return NextResponse.json(await runVerificationCron(now));
}
