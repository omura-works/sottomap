import { describe, expect, it } from "vitest";
import { planCronActions, type CronSpotInput } from "./logic";

const NOW = new Date("2026-09-09T00:00:00.000Z");

function daysAgo(days: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function spot(overrides: Partial<CronSpotInput>): CronSpotInput {
  return {
    id: "spot-1",
    status: "pending",
    createdAt: daysAgo(0),
    nextVerificationAt: null,
    endorsementCount: 0,
    ...overrides,
  };
}

describe("planCronActions", () => {
  it("pending が30日以内・未承認なら何もしない", () => {
    const plan = planCronActions([spot({ createdAt: daysAgo(29), endorsementCount: 0 })], NOW);
    expect(plan.actions).toHaveLength(0);
  });

  it("pending が承認30日ちょうどでは expired にしない（30日を超えてから）", () => {
    const plan = planCronActions([spot({ createdAt: daysAgo(30), endorsementCount: 0 })], NOW);
    expect(plan.actions).toHaveLength(0);
  });

  it("pending が31日経過・未承認なら expired にする", () => {
    const plan = planCronActions([spot({ createdAt: daysAgo(31), endorsementCount: 1 })], NOW);
    expect(plan.actions).toEqual([{ id: "spot-1", from: "pending", to: "expired" }]);
  });

  it("pending が承認2人集まれば経過日数によらず published にする", () => {
    const plan = planCronActions([spot({ createdAt: daysAgo(31), endorsementCount: 2 })], NOW);
    expect(plan.actions).toEqual([{ id: "spot-1", from: "pending", to: "published" }]);
  });

  it("published が次回確認日から90日未満（＝最終確認から180日未満）なら dormant にしない", () => {
    const plan = planCronActions(
      [spot({ status: "published", nextVerificationAt: daysAgo(89) })],
      NOW,
    );
    expect(plan.actions).toHaveLength(0);
  });

  it("published が次回確認日から90日経過（＝最終確認から180日経過）で dormant にする", () => {
    const plan = planCronActions(
      [spot({ status: "published", nextVerificationAt: daysAgo(90) })],
      NOW,
    );
    expect(plan.actions).toEqual([{ id: "spot-1", from: "published", to: "dormant" }]);
  });

  it("次回確認日を迎えた published スポットを確認依頼対象として数える", () => {
    const plan = planCronActions(
      [
        spot({ id: "due", status: "published", nextVerificationAt: daysAgo(1) }),
        spot({ id: "not-due", status: "published", nextVerificationAt: daysAgo(-1) }),
      ],
      NOW,
    );
    expect(plan.dueForVerification).toEqual([{ id: "due" }]);
  });

  it("dormant / expired は cron では変化させない", () => {
    const plan = planCronActions(
      [spot({ status: "dormant" }), spot({ status: "expired" })],
      NOW,
    );
    expect(plan.actions).toHaveLength(0);
  });
});
