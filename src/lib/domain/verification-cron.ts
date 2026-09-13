import type { RequestStatus, SpotStatus } from "../db/types";
import { nextStatus, nextVerificationDate, PENDING_EXPIRY_DAYS } from "./lifecycle";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CronSpotInput {
  id: string;
  authorId: string;
  status: SpotStatus;
  createdAt: string;
  publishedAt: string | null;
  endorsementCreatedAts: string[];
}

export interface CronVerificationRequestInput {
  id: string;
  spotId: string;
  dueAt: string;
  status: RequestStatus;
}

export interface CronSpotAction {
  id: string;
  from: SpotStatus;
  to: SpotStatus;
}

export interface CronRequestAction {
  id: string;
  from: "open";
  to: "missed";
}

export interface CronRequestToCreate {
  spotId: string;
  userId: string;
  dueAt: string;
}

export interface CronPlan {
  spotActions: CronSpotAction[];
  requestActions: CronRequestAction[];
  requestsToCreate: CronRequestToCreate[];
}

/** SPEC §9.1/§9.4/§9.7 に従い、cron が行う変更を副作用なしで組み立てる。 */
export function planCronActions(
  spots: CronSpotInput[],
  requests: CronVerificationRequestInput[],
  now: Date,
): CronPlan {
  const spotActions: CronSpotAction[] = [];
  const requestActions: CronRequestAction[] = [];
  const requestsToCreate: CronRequestToCreate[] = [];
  const openRequestBySpotId = new Map(
    requests.filter((request) => request.status === "open").map((request) => [request.spotId, request]),
  );

  for (const spot of spots) {
    const openRequest = openRequestBySpotId.get(spot.id) ?? null;
    const expiryAt = new Date(spot.createdAt).getTime() + PENDING_EXPIRY_DAYS * DAY_MS;
    const timelyEndorsementCount = spot.endorsementCreatedAts.filter(
      (createdAt) => new Date(createdAt).getTime() <= expiryAt,
    ).length;
    const to = nextStatus(spot, openRequest, timelyEndorsementCount, now);

    if (openRequest && to === "dormant") {
      requestActions.push({ id: openRequest.id, from: "open", to: "missed" });
    }
    if (to !== spot.status) {
      spotActions.push({ id: spot.id, from: spot.status, to });
    }
    if (to === "published" && !openRequest) {
      requestsToCreate.push({ spotId: spot.id, userId: spot.authorId, dueAt: nextVerificationDate(now).toISOString() });
    }
  }

  return { spotActions, requestActions, requestsToCreate };
}
