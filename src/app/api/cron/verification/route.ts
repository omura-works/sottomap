import { NextResponse } from "next/server";
import { listSpotsForCron, updateSpotStatus } from "@/components/spot-form/db";
import { planCronActions } from "./logic";

export const dynamic = "force-dynamic";

/**
 * 90日検証の定期処理 `src/app/api/cron/verification/route.ts`。
 * `vercel.json` の Cron 設定から呼ばれる想定。`CRON_SECRET` の Bearer 認可が無いと 401。
 *
 * - pending が30日承認が集まらなければ expired（`PENDING_EXPIRY_DAYS`）
 * - published が無回答のまま180日経てば dormant（`DORMANT_AFTER_DAYS`）
 * - 次回確認日を迎えた published スポットを「確認依頼あり」として件数だけ返す
 *   （verification_request の永続テーブルは無いため、都度の判定で導出する。
 *   `logic.ts` のコメント参照）
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const spots = await listSpotsForCron();
  const plan = planCronActions(spots, now);

  for (const action of plan.actions) {
    await updateSpotStatus(action.id, action.to, now);
  }

  return NextResponse.json({
    checked: spots.length,
    changed: plan.actions.length,
    actions: plan.actions,
    dueForVerificationCount: plan.dueForVerification.length,
  });
}
