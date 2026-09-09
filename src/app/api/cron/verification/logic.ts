// cron ハンドラの純粋なドメイン判定ロジック（Supabase I/O から切り離してテストする）。
// SPEC §2.2 / §2.3: 期限到来で確認依頼、無回答180日で dormant、pending 30日で expired。

import type { SpotStatus } from "@/lib/db/types";
import { nextStatus } from "@/lib/domain/lifecycle";

export interface CronSpotInput {
  id: string;
  status: SpotStatus;
  createdAt: string;
  nextVerificationAt: string | null;
  endorsementCount: number;
}

export interface CronSpotAction {
  id: string;
  from: SpotStatus;
  to: SpotStatus;
}

export interface CronDueVerification {
  id: string;
}

export interface CronPlan {
  actions: CronSpotAction[];
  dueForVerification: CronDueVerification[];
}

/**
 * spots を1件ずつ `nextStatus`（lifecycle.ts）にかけ、状態変化が必要なものを集める。
 * あわせて「次回確認日を迎えた公開スポット」＝確認依頼の対象を集める
 * （SPEC のデータモデルに verification_request テーブルが無いため、
 * 依頼の永続化はせず、都度この判定で「依頼中」を導出する設計。詳細は
 * `src/app/verify/[requestId]/page.tsx` のコメントを参照）。
 */
export function planCronActions(spots: CronSpotInput[], now: Date): CronPlan {
  const actions: CronSpotAction[] = [];
  const dueForVerification: CronDueVerification[] = [];

  for (const spot of spots) {
    const to = nextStatus(spot, spot.endorsementCount, now);
    if (to !== spot.status) {
      actions.push({ id: spot.id, from: spot.status, to });
    }

    if (to === "published" && spot.nextVerificationAt) {
      const due = new Date(spot.nextVerificationAt).getTime() <= now.getTime();
      if (due) dueForVerification.push({ id: spot.id });
    }
  }

  return { actions, dueForVerification };
}
