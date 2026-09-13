import { describe, expect, it } from "vitest";
import {
  planCronActions,
  type CronSpotInput,
  type CronVerificationRequestInput,
} from "./logic";

const NOW = new Date("2026-09-09T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function spot(overrides: Partial<CronSpotInput> = {}): CronSpotInput {
  return {
    id: "spot-1",
    authorId: "author-1",
    status: "pending",
    createdAt: daysAgo(0),
    publishedAt: null,
    endorsementCreatedAts: [],
    ...overrides,
  };
}

function request(overrides: Partial<CronVerificationRequestInput> = {}): CronVerificationRequestInput {
  return {
    id: "request-1",
    spotId: "spot-1",
    dueAt: daysAgo(0),
    status: "open",
    ...overrides,
  };
}

describe("planCronActions", () => {
  it("期限前（同時刻を含む）に2人目の承認が成立した pending は公開する", () => {
    const plan = planCronActions(
      [spot({ createdAt: daysAgo(31), endorsementCreatedAts: [daysAgo(2), daysAgo(1)] })],
      [],
      NOW,
    );

    expect(plan.spotActions).toEqual([{ id: "spot-1", from: "pending", to: "published" }]);
    expect(plan.requestsToCreate).toEqual([
      { spotId: "spot-1", userId: "author-1", dueAt: "2026-12-08T00:00:00.000Z" },
    ]);
  });

  it("2人目の承認が期限後だった pending は expired にする", () => {
    const plan = planCronActions(
      [spot({ createdAt: daysAgo(31), endorsementCreatedAts: [daysAgo(2), daysAgo(0)] })],
      [],
      NOW,
    );

    expect(plan.spotActions).toEqual([{ id: "spot-1", from: "pending", to: "expired" }]);
    expect(plan.requestsToCreate).toEqual([]);
  });

  it("due_at から90日経過した open 依頼を missed、スポットを dormant にする", () => {
    const plan = planCronActions(
      [spot({ status: "published", createdAt: daysAgo(300) })],
      [request({ dueAt: daysAgo(90) })],
      NOW,
    );

    expect(plan.requestActions).toEqual([{ id: "request-1", from: "open", to: "missed" }]);
    expect(plan.spotActions).toEqual([{ id: "spot-1", from: "published", to: "dormant" }]);
    expect(plan.requestsToCreate).toEqual([]);
  });

  it("open 依頼が無い published スポットには90日後を期限とする依頼を作る", () => {
    const plan = planCronActions(
      [spot({ status: "published", createdAt: daysAgo(10) })],
      [request({ status: "answered" })],
      NOW,
    );

    expect(plan.requestsToCreate).toEqual([
      { spotId: "spot-1", userId: "author-1", dueAt: "2026-12-08T00:00:00.000Z" },
    ]);
  });

  it("同じ時刻で計画を適用して2回実行しても、2回目には変更が無い", () => {
    const spots = [spot({ status: "published", createdAt: daysAgo(300) })];
    const requests = [request({ dueAt: daysAgo(90) })];

    const first = planCronActions(spots, requests, NOW);
    for (const action of first.spotActions) {
      const target = spots.find((item) => item.id === action.id);
      if (target) target.status = action.to;
    }
    for (const action of first.requestActions) {
      const target = requests.find((item) => item.id === action.id);
      if (target) target.status = action.to;
    }
    for (const item of first.requestsToCreate) {
      requests.push({
        id: `created-${item.spotId}`,
        spotId: item.spotId,
        dueAt: item.dueAt,
        status: "open",
      });
    }

    const second = planCronActions(spots, requests, NOW);
    expect(second).toEqual({ spotActions: [], requestActions: [], requestsToCreate: [] });
  });
});
