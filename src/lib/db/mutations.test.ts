// src/lib/db/mutations.ts のフィクスチャ・フォールバック経路（インメモリ書き込み）を検証する。
// Supabase未接続（テスト環境には NEXT_PUBLIC_SUPABASE_URL 等が無い）前提。
//
// 各テストは可能な限り「新規に createSpot したスポット」を使って完結させ、
// supabase/seed.sql 相当の既存フィクスチャ（listRecentlyVerified の3人/5人/4人 等）を
// 壊さないようにしている。

import { beforeAll, describe, expect, it, vi } from "vitest";

const SAPPORO_CITY_ID = "a0000000-0000-4000-8000-000000000001";
const K_SAN = "b0000000-0000-4000-8000-000000000001"; // 北24条
const M_SAN = "b0000000-0000-4000-8000-000000000002"; // すすきの
const T_SAN = "b0000000-0000-4000-8000-000000000003"; // すすきの
const OTARU_S_SAN = "b0000000-0000-4000-8000-000000000006"; // 小樽

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
});

describe("createSpot", () => {
  it("pending として作成され、getSpot で取得できる", async () => {
    const { createSpot } = await import("./mutations");
    const { getSpot } = await import("./spots");

    const spot = await createSpot({
      cityId: SAPPORO_CITY_ID,
      name: "テスト食堂",
      reason: "テスト用の理由文",
      lat: 43.06,
      lng: 141.35,
      visitFrequency: "monthly",
      authorId: K_SAN,
    });

    expect(spot.status).toBe("pending");
    expect(spot.endorsementCount).toBe(0);
    expect(spot.publishedAt).toBeNull();

    const fetched = await getSpot(spot.id);
    expect(fetched?.name).toBe("テスト食堂");
  });
});

describe("endorseSpot", () => {
  it("同じ街の2人目の承認で published になり、open な確認依頼が作られる", async () => {
    const { createSpot, endorseSpot } = await import("./mutations");
    const { getUserProfile } = await import("./spots");

    const spot = await createSpot({
      cityId: SAPPORO_CITY_ID,
      name: "承認テスト店A",
      reason: "テスト用の理由文",
      lat: 43.06,
      lng: 141.35,
      visitFrequency: "weekly",
      authorId: K_SAN,
    });

    const pointsBefore = (await getUserProfile(K_SAN))!.lanternPoints;
    const first = await endorseSpot(spot.id, M_SAN);
    expect(first.published).toBe(false);

    const second = await endorseSpot(spot.id, T_SAN);
    expect(second.published).toBe(true);

    const { getSpot, getVerificationRequest } = await import("./spots");
    const published = await getSpot(spot.id);
    expect(published?.status).toBe("published");
    expect(published?.publishedAt).not.toBeNull();
    expect(published?.openRequestId).toBeTruthy();

    const request = await getVerificationRequest(published!.openRequestId as string);
    expect(request?.status).toBe("open");
    expect(request?.userId).toBe(K_SAN); // 依頼先は投稿者
    expect((await getUserProfile(K_SAN))!.lanternPoints).toBe(pointsBefore + 10);

    await endorseSpot(spot.id, T_SAN);
    expect((await getUserProfile(K_SAN))!.lanternPoints).toBe(pointsBefore + 10);
  });

  it("同じユーザーが二重に承認しても1人としてしかカウントされない", async () => {
    const { createSpot, endorseSpot } = await import("./mutations");
    const spot = await createSpot({
      cityId: SAPPORO_CITY_ID,
      name: "承認テスト店B",
      reason: "テスト用の理由文",
      lat: 43.06,
      lng: 141.35,
      visitFrequency: "weekly",
      authorId: K_SAN,
    });

    await endorseSpot(spot.id, M_SAN);
    await endorseSpot(spot.id, M_SAN); // 二重承認
    const { getSpot } = await import("./spots");
    const after = await getSpot(spot.id);
    expect(after?.endorsementCount).toBe(1);
    expect(after?.status).toBe("pending"); // まだ2人目が成立していない
  });

  it("自分の投稿には承認できない", async () => {
    const { createSpot, endorseSpot } = await import("./mutations");
    const spot = await createSpot({
      cityId: SAPPORO_CITY_ID,
      name: "承認テスト店C",
      reason: "テスト用の理由文",
      lat: 43.06,
      lng: 141.35,
      visitFrequency: "weekly",
      authorId: K_SAN,
    });
    await expect(endorseSpot(spot.id, K_SAN)).rejects.toThrow();
  });

  it("違う街のユーザーは承認できない", async () => {
    const { createSpot, endorseSpot } = await import("./mutations");
    const spot = await createSpot({
      cityId: SAPPORO_CITY_ID,
      name: "承認テスト店D",
      reason: "テスト用の理由文",
      lat: 43.06,
      lng: 141.35,
      visitFrequency: "weekly",
      authorId: K_SAN,
    });
    await expect(endorseSpot(spot.id, OTARU_S_SAN)).rejects.toThrow();
  });
});

describe("answerVerification（ポイントの二重付与防止・dormantからの復帰）", () => {
  it("open な依頼に回答すると +5 が一度だけ付与され、再送は0になる", async () => {
    const { createSpot, endorseSpot, answerVerification } = await import("./mutations");
    const { getSpot } = await import("./spots");

    const spot = await createSpot({
      cityId: SAPPORO_CITY_ID,
      name: "確認テスト店A",
      reason: "テスト用の理由文",
      lat: 43.06,
      lng: 141.35,
      visitFrequency: "weekly",
      authorId: K_SAN,
    });
    await endorseSpot(spot.id, M_SAN);
    await endorseSpot(spot.id, T_SAN);
    const published = await getSpot(spot.id);
    const requestId = published!.openRequestId as string;
    const { getUserProfile } = await import("./spots");
    const pointsBefore = (await getUserProfile(K_SAN))!.lanternPoints;

    const result = await answerVerification(requestId, K_SAN, "quiet", "変わっていない");
    expect(result.pointsAwarded).toBe(5);
    expect(result.status).toBe("published");
    expect((await getUserProfile(K_SAN))!.lanternPoints).toBe(pointsBefore + 5);

    // 同じ requestId への再送（二重送信・cron再実行相当）は冪等に 0 ポイント。
    const retry = await answerVerification(requestId, K_SAN, "quiet");
    expect(retry.pointsAwarded).toBe(0);
    expect((await getUserProfile(K_SAN))!.lanternPoints).toBe(pointsBefore + 5);

    const after = await getSpot(spot.id);
    expect(after?.lastVerifiedAt).not.toBeNull();
    expect(after?.openRequestId).not.toBe(requestId); // 新しい依頼に差し替わっている
  });

  it("dormant だったスポットは回答すると published に復帰する", async () => {
    const { createSpot, endorseSpot, answerVerification } = await import("./mutations");
    const { getSpot } = await import("./spots");
    const { findFixtureSpot } = await import("./fixtures");

    const spot = await createSpot({
      cityId: SAPPORO_CITY_ID,
      name: "確認テスト店B",
      reason: "テスト用の理由文",
      lat: 43.06,
      lng: 141.35,
      visitFrequency: "weekly",
      authorId: K_SAN,
    });
    await endorseSpot(spot.id, M_SAN);
    await endorseSpot(spot.id, T_SAN);
    const published = await getSpot(spot.id);
    const requestId = published!.openRequestId as string;

    // cron が missed→dormant にした状態を模してインメモリ状態を直接書き換える。
    const fixtureSpot = findFixtureSpot(spot.id);
    expect(fixtureSpot).toBeTruthy();
    fixtureSpot!.status = "dormant";

    const result = await answerVerification(requestId, K_SAN, "quiet");
    expect(result.status).toBe("published");

    const after = await getSpot(spot.id);
    expect(after?.status).toBe("published");
  });

  it("依頼先以外のユーザーは回答できない", async () => {
    const { createSpot, endorseSpot, answerVerification } = await import("./mutations");
    const { getSpot } = await import("./spots");

    const spot = await createSpot({
      cityId: SAPPORO_CITY_ID,
      name: "確認テスト店C",
      reason: "テスト用の理由文",
      lat: 43.06,
      lng: 141.35,
      visitFrequency: "weekly",
      authorId: K_SAN,
    });
    await endorseSpot(spot.id, M_SAN);
    await endorseSpot(spot.id, T_SAN);
    const published = await getSpot(spot.id);
    const requestId = published!.openRequestId as string;

    await expect(answerVerification(requestId, M_SAN, "quiet")).rejects.toThrow();
  });
});

describe("addBookmark / removeBookmark", () => {
  it("追加・重複追加（冪等）・削除ができる", async () => {
    const { createSpot } = await import("./mutations");
    const { addBookmark, removeBookmark } = await import("./mutations");
    const { listBookmarks } = await import("./spots");

    const spot = await createSpot({
      cityId: SAPPORO_CITY_ID,
      name: "栞テスト店",
      reason: "テスト用の理由文",
      lat: 43.06,
      lng: 141.35,
      visitFrequency: "weekly",
      authorId: K_SAN,
    });

    const before = (await listBookmarks(M_SAN)).length;
    await addBookmark(M_SAN, spot.id);
    await addBookmark(M_SAN, spot.id); // 重複追加は冪等
    const afterAdd = await listBookmarks(M_SAN);
    expect(afterAdd.length).toBe(before + 1);

    await removeBookmark(M_SAN, spot.id);
    const afterRemove = await listBookmarks(M_SAN);
    expect(afterRemove.length).toBe(before);
  });
});

describe("runVerificationCron", () => {
  it("同じ時刻で2回実行しても open 依頼を重複作成しない", async () => {
    const { createSpot, runVerificationCron } = await import("./mutations");
    const { FIXTURE_VERIFICATION_REQUESTS, findFixtureSpot } = await import("./fixtures");
    const spot = await createSpot({
      cityId: SAPPORO_CITY_ID,
      name: "cron冪等テスト店",
      reason: "テスト用の理由文",
      lat: 43.06,
      lng: 141.35,
      visitFrequency: "weekly",
      authorId: K_SAN,
    });
    findFixtureSpot(spot.id)!.status = "published";
    const now = new Date("2026-09-09T00:00:00.000Z");

    const first = await runVerificationCron(now);
    const afterFirst = FIXTURE_VERIFICATION_REQUESTS.filter((item) => item.spotId === spot.id).map((item) => ({ ...item }));
    const second = await runVerificationCron(now);
    const afterSecond = FIXTURE_VERIFICATION_REQUESTS.filter((item) => item.spotId === spot.id).map((item) => ({ ...item }));

    expect(first.createdRequestCount).toBeGreaterThanOrEqual(1);
    expect(second).toEqual({ checked: first.checked, changed: 0, missedRequestCount: 0, createdRequestCount: 0 });
    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond).toHaveLength(1);
  });
});

describe("setUserHomeCity", () => {
  it("デモモードでは保存せず、フィクスチャの居住街を変えない", async () => {
    const { setUserHomeCity } = await import("./mutations");
    const { getUserProfile } = await import("./spots");
    const before = await getUserProfile(K_SAN);

    await setUserHomeCity(K_SAN, "a0000000-0000-4000-8000-000000000002");

    expect((await getUserProfile(K_SAN))?.homeCityId).toBe(before?.homeCityId);
  });
});
