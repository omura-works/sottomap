import { NextResponse } from "next/server";
import { runVerificationCron } from "@/lib/db/mutations";

export const dynamic = "force-dynamic";

/**
 * 90日検証の定期処理 `src/app/api/cron/verification/route.ts`。
 * `vercel.json` の Cron 設定から呼ばれる想定。`CRON_SECRET` の Bearer 認可が無いと 401。
 *
 * - pending は期限前の承認が2人なら published、足りなければ期限後に expired
 * - open 依頼が due_at から90日経過したら missed、対象スポットを dormant
 * - open 依頼が無い published スポットには次回依頼を1件作る
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  return NextResponse.json(await runVerificationCron(now));
}
