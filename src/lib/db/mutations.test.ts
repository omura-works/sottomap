// src/lib/db/mutations.ts のフィクスチャ・フォールバック経路（インメモリ書き込み）を検証する。
// デモモード（vitest.config.ts が URASUPO_DEMO_MODE=1 を渡す）前提。
// フィクスチャ経路には DB 関数（supabase/migrations/0006_security_hardening.sql）と同じ規則を
// 実装してあり、ここでその規則を検証する（SQL 自体の検証は supabase/tests/*.sql の pgTAP）。
//
// 各テストは可能な限り「新規に createSpot したスポット」を使って完結させ、
// supabase/seed.sql 相当の既存フィクスチャ（listRecentlyVerified の3人/5人/4人 等）を
// 壊さないようにしている。

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resetFixtureUserHomeCities } from "./fixtures";

const SAPPORO_CITY_ID = "a0000000-0000-4000-8000-000000000001";
const K_SAN = "b0000000-0000-4000-8000-000000000001"; // 北24条
const M_SAN = "b0000000-0000-4000-8000-000000000002"; // すすきの
const T_SAN = "b0000000-0000-4000-8000-000000000003"; // すすきの
const OTARU_S_SAN = "b0000000-0000-4000-8000-000000000006"; // 小樽
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
});

afterEach(() => {
  vi.useRealTimers();
  resetFixtureUserHomeCities();
});

/** Date だけを偽の時計にする（Promise やタイマーには触れない）。 */
function freezeAt(time: Date): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(time);
}

/** 札幌に K さんのピンを立て、M さん・T さんの承認で公開する。公開された Spot を返す。 */
async function createPublishedSpot(name: string) {
  const { createSpot, endorseSpot } = await import("./mutations");
  const { getSpot } = await import("./spots");
  const spot = await createSpot({
    cityId: SAPPORO_CITY_ID,
    name,
    reason: "テスト用の理由文",
    lat: 43.06,
    lng: 141.35,
    visitFrequency: "weekly",
    authorId: K_SAN,
  });
  await endorseSpot(spot.id, M_SAN);
  await endorseSpot(spot.id, T_SAN);
  const published = await getSpot(spot.id);
  if (!published?.openRequestId) throw new Error("公開と確認依頼の作成に失敗した");
  return published;
}

function newPendingInput(name: string) {
  return {
    cityId: SAPPORO_CITY_ID,
    name,
    reason: "テスト用の理由文",
    lat: 43.06,
    lng: 141.35,
    visitFrequency: "weekly" as const,
    authorId: K_SAN,
  };
}

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

    // 公開済みスポットへの承認は拒否され、公開 +10 も二重に付かない。
    await expect(endorseSpot(spot.id, T_SAN)).rejects.toThrow("このピンは承認を受け付けていません");
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

describe("answerVerification（Spec §9.13.3: 回答できる時点・二重受理の禁止・dormant からの復帰）", () => {
  it("期限前（due_at が未来）の依頼への回答は拒否され、記録もポイントも増えない", async () => {
    const { answerVerification } = await import("./mutations");
    const { getUserProfile } = await import("./spots");
    const { FIXTURE_VERIFICATIONS } = await import("./fixtures");

    const published = await createPublishedSpot("確認テスト店・期限前");
    const pointsBefore = (await getUserProfile(K_SAN))!.lanternPoints;
    const verificationsBefore = FIXTURE_VERIFICATIONS.length;

    await expect(answerVerification(published.openRequestId!, K_SAN, "quiet")).rejects.toThrow(
      "この確認はまだ届いていません",
    );
    expect((await getUserProfile(K_SAN))!.lanternPoints).toBe(pointsBefore);
    expect(FIXTURE_VERIFICATIONS.length).toBe(verificationsBefore);
  });

  it("備考は500文字まで（answer_verification と同じ。501文字は記録せずに拒否。§9.18・0012）", async () => {
    const { answerVerification } = await import("./mutations");
    const { getVerificationRequest } = await import("./spots");
    const { FIXTURE_VERIFICATIONS } = await import("./fixtures");

    const published = await createPublishedSpot("確認テスト店・備考の長さ");
    const requestId = published.openRequestId!;
    const request = await getVerificationRequest(requestId);
    freezeAt(new Date(new Date(request!.dueAt).getTime() + HOUR_MS));

    const verificationsBefore = FIXTURE_VERIFICATIONS.length;
    await expect(answerVerification(requestId, K_SAN, "quiet", "あ".repeat(501))).rejects.toThrow(
      "備考は500文字以内で入力してください",
    );
    expect(FIXTURE_VERIFICATIONS.length).toBe(verificationsBefore);
    await expect(answerVerification(requestId, K_SAN, "quiet", "🏮".repeat(500))).resolves.toMatchObject({ accepted: true });
  });

  it("期限到来済みの依頼に回答すると +5 が一度だけ付き、同じ依頼への2回目は受理されず加算もない", async () => {
    const { answerVerification } = await import("./mutations");
    const { getSpot, getUserProfile, getVerificationRequest } = await import("./spots");
    const { FIXTURE_LANTERN_EVENTS, FIXTURE_VERIFICATIONS } = await import("./fixtures");

    const published = await createPublishedSpot("確認テスト店・二重送信");
    const requestId = published.openRequestId!;
    const request = await getVerificationRequest(requestId);
    freezeAt(new Date(new Date(request!.dueAt).getTime() + HOUR_MS));

    const pointsBefore = (await getUserProfile(K_SAN))!.lanternPoints;
    const result = await answerVerification(requestId, K_SAN, "quiet", "変わっていない");
    expect(result).toEqual({ accepted: true, pointsAwarded: 5, status: "published" });
    expect((await getUserProfile(K_SAN))!.lanternPoints).toBe(pointsBefore + 5);

    const retry = await answerVerification(requestId, K_SAN, "crowding");
    expect(retry).toEqual({ accepted: false, pointsAwarded: 0, status: "published" });
    expect((await getUserProfile(K_SAN))!.lanternPoints).toBe(pointsBefore + 5);
    expect(FIXTURE_VERIFICATIONS.filter((v) => v.spotId === published.id)).toHaveLength(1);
    expect(FIXTURE_LANTERN_EVENTS.filter((e) => e.kind === "verification" && e.sourceId === requestId)).toHaveLength(1);

    const after = await getSpot(published.id);
    expect(after?.quietness).toBe("quiet"); // 2回目の crowding は反映されない
    expect(after?.openRequestId).not.toBe(requestId); // 次の依頼に差し替わっている
    const next = await getVerificationRequest(after!.openRequestId!);
    expect(new Date(next!.dueAt).getTime()).toBe(Date.now() + 90 * DAY_MS); // now + 90日
  });

  it("dormant になったスポットは最新の missed 依頼に1回だけ回答でき、published に戻る。2回目の復帰回答は拒否", async () => {
    const { answerVerification, runVerificationCron } = await import("./mutations");
    const { getSpot, getUserProfile, getVerificationRequest } = await import("./spots");

    const published = await createPublishedSpot("確認テスト店・復帰");
    const missedRequestId = published.openRequestId!;
    const request = await getVerificationRequest(missedRequestId);
    // due_at から90日無回答 → cron が missed / dormant にする。
    const cronAt = new Date(new Date(request!.dueAt).getTime() + 90 * DAY_MS);
    freezeAt(cronAt);
    await runVerificationCron(cronAt);
    expect((await getSpot(published.id))?.status).toBe("dormant");
    expect((await getVerificationRequest(missedRequestId))?.status).toBe("missed");

    const pointsBefore = (await getUserProfile(K_SAN))!.lanternPoints;
    const revived = await answerVerification(missedRequestId, K_SAN, "quiet");
    expect(revived).toEqual({ accepted: true, pointsAwarded: 5, status: "published" });
    const after = await getSpot(published.id);
    expect(after?.status).toBe("published");
    expect(after?.openRequestId).toBeTruthy();
    expect((await getVerificationRequest(missedRequestId))?.status).toBe("answered");

    // 同じ missed 依頼での2回目の復帰は受理しない（記録・加算なし）。
    const second = await answerVerification(missedRequestId, K_SAN, "quiet");
    expect(second).toEqual({ accepted: false, pointsAwarded: 0, status: "published" });
    expect((await getUserProfile(K_SAN))!.lanternPoints).toBe(pointsBefore + 5);
  });

  it("dormant でも最新ではない missed 依頼には回答できない", async () => {
    const { answerVerification } = await import("./mutations");
    const { FIXTURE_VERIFICATION_REQUESTS, findFixtureSpot } = await import("./fixtures");

    const published = await createPublishedSpot("確認テスト店・古いmissed");
    const latest = FIXTURE_VERIFICATION_REQUESTS.find((r) => r.id === published.openRequestId)!;
    const now = Date.now();
    latest.status = "missed";
    latest.dueAt = new Date(now - 100 * DAY_MS).toISOString();
    const olderId = crypto.randomUUID();
    FIXTURE_VERIFICATION_REQUESTS.push({
      id: olderId,
      spotId: published.id,
      userId: K_SAN,
      dueAt: new Date(now - 300 * DAY_MS).toISOString(),
      status: "missed",
      answeredVerificationId: null,
      createdAt: new Date(now - 390 * DAY_MS).toISOString(),
    });
    findFixtureSpot(published.id)!.status = "dormant";

    await expect(answerVerification(olderId, K_SAN, "quiet")).rejects.toThrow("この確認依頼には、もう回答できません");
    await expect(answerVerification(latest.id, K_SAN, "quiet")).resolves.toMatchObject({
      accepted: true,
      status: "published",
    });
  });

  it("スポットが published のときは、残っている missed 依頼には回答できない", async () => {
    const { answerVerification } = await import("./mutations");
    const { FIXTURE_VERIFICATION_REQUESTS } = await import("./fixtures");

    const published = await createPublishedSpot("確認テスト店・公開中のmissed");
    const now = Date.now();
    const missedId = crypto.randomUUID();
    FIXTURE_VERIFICATION_REQUESTS.push({
      id: missedId,
      spotId: published.id,
      userId: K_SAN,
      dueAt: new Date(now - 200 * DAY_MS).toISOString(),
      status: "missed",
      answeredVerificationId: null,
      createdAt: new Date(now - 290 * DAY_MS).toISOString(),
    });

    await expect(answerVerification(missedId, K_SAN, "quiet")).rejects.toThrow("この確認依頼には、もう回答できません");
  });

  it("依頼先以外のユーザーは回答できない（見つからない扱い）", async () => {
    const { answerVerification } = await import("./mutations");
    const published = await createPublishedSpot("確認テスト店・他人");
    await expect(answerVerification(published.openRequestId!, M_SAN, "quiet")).rejects.toThrow(
      "確認依頼が見つかりませんでした",
    );
  });
});

describe("pending の期限（Spec §9.13.5・絶対時刻）", () => {
  it("期限（created_at + 30日）を1時間過ぎた pending への承認は拒否", async () => {
    const { createSpot, endorseSpot } = await import("./mutations");
    const t0 = new Date("2026-03-01T00:00:00.000Z");
    freezeAt(t0);
    const spot = await createSpot(newPendingInput("期限テスト店A"));

    vi.setSystemTime(new Date(t0.getTime() + 30 * DAY_MS + HOUR_MS));
    await expect(endorseSpot(spot.id, M_SAN)).rejects.toThrow("承認の期限を過ぎています");
  });

  it("created_at + 30日 + 1時間に cron を実行すると expired（日数の切り捨てで延命しない）。以後の承認も拒否", async () => {
    const { createSpot, endorseSpot, runVerificationCron } = await import("./mutations");
    const { getSpot } = await import("./spots");
    const t0 = new Date("2026-03-02T00:00:00.000Z");
    freezeAt(t0);
    const spot = await createSpot(newPendingInput("期限テスト店B"));
    vi.setSystemTime(new Date(t0.getTime() + DAY_MS));
    await endorseSpot(spot.id, M_SAN); // 1人だけ

    const cronAt = new Date(t0.getTime() + 30 * DAY_MS + HOUR_MS);
    vi.setSystemTime(cronAt);
    await runVerificationCron(cronAt);
    expect((await getSpot(spot.id))?.status).toBe("expired");
    await expect(endorseSpot(spot.id, T_SAN)).rejects.toThrow("承認の期限を過ぎています");
  });

  it("期限前に2人目が承認していれば、そのまま公開され、期限後の cron でも published のまま", async () => {
    const { createSpot, endorseSpot, runVerificationCron } = await import("./mutations");
    const { getSpot } = await import("./spots");
    const t0 = new Date("2026-03-05T00:00:00.000Z");
    freezeAt(t0);
    const spot = await createSpot(newPendingInput("期限テスト店E"));
    vi.setSystemTime(new Date(t0.getTime() + DAY_MS));
    await endorseSpot(spot.id, M_SAN);
    vi.setSystemTime(new Date(t0.getTime() + 30 * DAY_MS - HOUR_MS));
    await expect(endorseSpot(spot.id, T_SAN)).resolves.toEqual({ published: true });

    const cronAt = new Date(t0.getTime() + 31 * DAY_MS);
    vi.setSystemTime(cronAt);
    await runVerificationCron(cronAt);
    expect((await getSpot(spot.id))?.status).toBe("published");
  });

  it("期限前に2人の承認が記録済みなら、cron の実行が期限後でも公開が勝つ（+10 は一度だけ）", async () => {
    const { createSpot, runVerificationCron } = await import("./mutations");
    const { getSpot, getUserProfile } = await import("./spots");
    const { FIXTURE_ENDORSEMENT_LOG, FIXTURE_LANTERN_EVENTS } = await import("./fixtures");
    const t0 = new Date("2026-03-03T00:00:00.000Z");
    freezeAt(t0);
    const spot = await createSpot(newPendingInput("期限テスト店C"));
    // DB で承認が期限前にコミットされたが、公開の反映前に cron が期限後に走った状況に相当する。
    // 2人目は期限ちょうど（同時刻は公開を優先）。
    FIXTURE_ENDORSEMENT_LOG.push(
      { spotId: spot.id, userId: M_SAN, createdAt: new Date(t0.getTime() + DAY_MS).toISOString() },
      { spotId: spot.id, userId: T_SAN, createdAt: new Date(t0.getTime() + 30 * DAY_MS).toISOString() },
    );
    const pointsBefore = (await getUserProfile(K_SAN))!.lanternPoints;

    const cronAt = new Date(t0.getTime() + 31 * DAY_MS);
    vi.setSystemTime(cronAt);
    await runVerificationCron(cronAt);
    const after = await getSpot(spot.id);
    expect(after?.status).toBe("published");
    expect(after?.openRequestId).toBeTruthy();
    expect((await getUserProfile(K_SAN))!.lanternPoints).toBe(pointsBefore + 10);

    await runVerificationCron(cronAt);
    expect((await getUserProfile(K_SAN))!.lanternPoints).toBe(pointsBefore + 10);
    expect(FIXTURE_LANTERN_EVENTS.filter((e) => e.kind === "publish" && e.sourceId === spot.id)).toHaveLength(1);
  });

  it("2人目の承認が期限後なら公開されず、cron で expired", async () => {
    const { createSpot, runVerificationCron } = await import("./mutations");
    const { getSpot } = await import("./spots");
    const { FIXTURE_ENDORSEMENT_LOG } = await import("./fixtures");
    const t0 = new Date("2026-03-04T00:00:00.000Z");
    freezeAt(t0);
    const spot = await createSpot(newPendingInput("期限テスト店D"));
    FIXTURE_ENDORSEMENT_LOG.push(
      { spotId: spot.id, userId: M_SAN, createdAt: new Date(t0.getTime() + DAY_MS).toISOString() },
      { spotId: spot.id, userId: T_SAN, createdAt: new Date(t0.getTime() + 30 * DAY_MS + 1).toISOString() },
    );
    const cronAt = new Date(t0.getTime() + 31 * DAY_MS);
    vi.setSystemTime(cronAt);
    await runVerificationCron(cronAt);
    expect((await getSpot(spot.id))?.status).toBe("expired");
  });
});

describe("createSpot の居住街チェック（create_spot と同じ規則）", () => {
  it("住んでいない街にはピンを立てられない", async () => {
    const { createSpot } = await import("./mutations");
    await expect(createSpot({ ...newPendingInput("別の街の人の店"), authorId: OTARU_S_SAN })).rejects.toThrow(
      "住んでいる街にだけピンを立てられます",
    );
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
    const first = await addBookmark(M_SAN, spot.id);
    await addBookmark(M_SAN, spot.id); // 重複追加は冪等
    const afterAdd = await listBookmarks(M_SAN);
    expect(afterAdd.length).toBe(before + 1);

    // 再登録は DB の upsert と同じく、既存行の予定日を上書きする（id・作成日時・メタはそのまま）
    const planned = "2026-10-01T03:30:00.000Z";
    const updated = await addBookmark(M_SAN, spot.id, planned);
    expect(updated).toMatchObject({ id: first.id, createdAt: first.createdAt, plannedAt: planned, meta: null });
    expect((await listBookmarks(M_SAN)).find((b) => b.spotId === spot.id)?.plannedAt).toBe(planned);
    const cleared = await addBookmark(M_SAN, spot.id);
    expect(cleared.plannedAt).toBeNull();

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
    expect(second).toMatchObject({ changed: 0, missedRequestCount: 0, createdRequestCount: 0 });
    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond).toHaveLength(1);
  });
});

const OTARU_CITY_ID = "a0000000-0000-4000-8000-000000000002";

describe("setUserHomeCity（デモモードでも居住街を実際に変える）", () => {
  it("小樽へ変えると小樽に投稿でき、札幌には投稿できなくなる", async () => {
    const { setUserHomeCity, createSpot } = await import("./mutations");
    const { getUserProfile } = await import("./spots");

    await setUserHomeCity(K_SAN, OTARU_CITY_ID);

    expect((await getUserProfile(K_SAN))?.homeCityId).toBe(OTARU_CITY_ID);
    const spot = await createSpot({ ...newPendingInput("小樽に越した人の店"), cityId: OTARU_CITY_ID });
    expect(spot.citySlug).toBe("otaru");
    await expect(createSpot(newPendingInput("元の街の店"))).rejects.toThrow("住んでいる街にだけピンを立てられます");
  });

  it("小樽へ変えると小樽の pending を承認できる（同じ街の判定に効く）", async () => {
    const { setUserHomeCity, createSpot, endorseSpot } = await import("./mutations");
    const spot = await createSpot({ ...newPendingInput("小樽の承認テスト店"), cityId: OTARU_CITY_ID, authorId: OTARU_S_SAN });

    await expect(endorseSpot(spot.id, M_SAN)).rejects.toThrow("同じ街に住むユーザーのみ承認できます");
    await setUserHomeCity(M_SAN, OTARU_CITY_ID);
    await expect(endorseSpot(spot.id, M_SAN)).resolves.toEqual({ published: false });
  });

  it("テスト間でリセットされ、前のテストの変更が残らない", async () => {
    const { getUserProfile } = await import("./spots");
    expect((await getUserProfile(K_SAN))?.homeCityId).toBe(SAPPORO_CITY_ID);
    expect((await getUserProfile(M_SAN))?.homeCityId).toBe(SAPPORO_CITY_ID);
  });

  it("存在しない街は拒否する", async () => {
    const { setUserHomeCity } = await import("./mutations");
    await expect(setUserHomeCity(K_SAN, "no-such-city")).rejects.toThrow("街の情報が取得できませんでした");
  });
});

describe("setUserHomeCity の90日制限（SPEC §9.16。set_home_city と同じ規則）", () => {
  it("同じ街は何もしない（変更に数えない）", async () => {
    const { setUserHomeCity } = await import("./mutations");
    const { getUserProfile } = await import("./spots");

    await expect(setUserHomeCity(K_SAN, SAPPORO_CITY_ID)).resolves.toBeNull();
    expect((await getUserProfile(K_SAN))?.homeCityChangedAt).toBeNull();
  });

  it("別の街へ変えると時刻を記録し、90日以内の次の変更は次に変えられる日を添えて拒否する", async () => {
    const { setUserHomeCity } = await import("./mutations");
    const { getUserProfile } = await import("./spots");
    // 東京 2026-09-18 10:00 に変える → 90日後は 2026-12-17 10:00 → 端数を切り上げて「2026年12月18日以降」
    freezeAt(new Date("2026-09-18T01:00:00.000Z"));

    await expect(setUserHomeCity(K_SAN, OTARU_CITY_ID)).resolves.toBe("2026-09-18T01:00:00.000Z");
    expect((await getUserProfile(K_SAN))?.homeCityChangedAt).toBe("2026-09-18T01:00:00.000Z");

    freezeAt(new Date("2026-12-17T00:59:59.000Z"));
    await expect(setUserHomeCity(K_SAN, SAPPORO_CITY_ID)).rejects.toThrow(
      "住んでいる街は90日に1回まで変えられます。次に変えられるのは2026年12月18日以降です。",
    );
    // 制限中でも同じ街は拒否しない
    await expect(setUserHomeCity(K_SAN, OTARU_CITY_ID)).resolves.toBe("2026-09-18T01:00:00.000Z");
    expect((await getUserProfile(K_SAN))?.homeCityId).toBe(OTARU_CITY_ID);
  });

  it("ちょうど90日経てば、また別の街へ変えられる", async () => {
    const { setUserHomeCity } = await import("./mutations");
    const { getUserProfile } = await import("./spots");
    freezeAt(new Date("2026-09-18T01:00:00.000Z"));
    await setUserHomeCity(K_SAN, OTARU_CITY_ID);

    freezeAt(new Date(Date.parse("2026-09-18T01:00:00.000Z") + 90 * DAY_MS));
    await expect(setUserHomeCity(K_SAN, SAPPORO_CITY_ID)).resolves.toBe("2026-12-17T01:00:00.000Z");
    expect((await getUserProfile(K_SAN))?.homeCityId).toBe(SAPPORO_CITY_ID);
  });

  it("変更時刻もテスト間でリセットされる", async () => {
    const { getUserProfile } = await import("./spots");
    expect((await getUserProfile(K_SAN))?.homeCityChangedAt).toBeNull();
  });
});

describe("createSpot の入力検証（create_spot と同じ規則・同じ文言）", () => {
  it.each([
    ["空の名前", { name: "   " }, "店の名前は80字以内で入力してください"],
    ["81字の名前", { name: "あ".repeat(81) }, "店の名前は80字以内で入力してください"],
    ["空の理由", { reason: "  " }, "なぜここへ行くのかを60字以内で入力してください"],
    ["61字の理由", { reason: "い".repeat(61) }, "なぜここへ行くのかを60字以内で入力してください"],
    ["不明な頻度", { visitFrequency: "daily" }, "行く頻度を選んでください"],
    ["範囲外の緯度", { lat: 91 }, "場所を選んでください"],
    ["範囲外の経度", { lng: -181 }, "場所を選んでください"],
    ["数でない座標", { lat: Number.NaN }, "場所を選んでください"],
  ])("%s は拒否され、フィクスチャに残らない", async (_label, override, message) => {
    const { createSpot } = await import("./mutations");
    const { FIXTURE_SPOTS } = await import("./fixtures");
    const before = FIXTURE_SPOTS.length;
    const input = { ...newPendingInput("検証テスト店"), ...override } as Parameters<typeof createSpot>[0];
    await expect(createSpot(input)).rejects.toThrow(message);
    expect(FIXTURE_SPOTS.length).toBe(before);
  });

  it("80字の名前・60字の理由（絵文字はコードポイントで数える）は受け付け、名前の前後の空白を除く", async () => {
    const { createSpot } = await import("./mutations");
    const name = "🍜".repeat(80);
    const spot = await createSpot({ ...newPendingInput(` ${name} `), reason: "🐟".repeat(60) });
    expect(spot.name).toBe(name);
    expect(spot.reason).toBe("🐟".repeat(60));
  });
});

describe("住んでいる街の初回設定（SPEC §9.16-1。initialize_home_city と同じ規則）", () => {
  it("setUserHomeCity: 「街だけ未設定・変更時刻あり」から初回設定すると、変更時刻も消える（古い制限が残らない）", async () => {
    const { overrideFixtureUserHomeCityForTest } = await import("./fixtures");
    const { setUserHomeCity } = await import("./mutations");
    const { getUserProfile } = await import("./spots");
    freezeAt(new Date("2026-09-18T01:00:00.000Z"));
    overrideFixtureUserHomeCityForTest(K_SAN, null, "2026-09-10T00:00:00.000Z");

    await expect(setUserHomeCity(K_SAN, OTARU_CITY_ID)).resolves.toBeNull();
    const profile = await getUserProfile(K_SAN);
    expect(profile?.homeCityId).toBe(OTARU_CITY_ID);
    expect(profile?.homeCityChangedAt).toBeNull();
    // 制限が残っていないので、続けて別の街へ変えられる
    await expect(setUserHomeCity(K_SAN, SAPPORO_CITY_ID)).resolves.toBe("2026-09-18T01:00:00.000Z");
  });

  it("initializeUserHomeCity: 未設定なら設定して true、変更時刻は記録しない", async () => {
    const { overrideFixtureUserHomeCityForTest } = await import("./fixtures");
    const { initializeUserHomeCity } = await import("./mutations");
    const { getUserProfile } = await import("./spots");
    overrideFixtureUserHomeCityForTest(K_SAN, null, "2026-09-10T00:00:00.000Z");

    await expect(initializeUserHomeCity(K_SAN, OTARU_CITY_ID)).resolves.toBe(true);
    const profile = await getUserProfile(K_SAN);
    expect(profile?.homeCityId).toBe(OTARU_CITY_ID);
    expect(profile?.homeCityChangedAt).toBeNull();
  });

  it("initializeUserHomeCity: 設定済みなら別の街でも何もせず false（例外にしない）", async () => {
    const { initializeUserHomeCity } = await import("./mutations");
    const { getUserProfile } = await import("./spots");

    await expect(initializeUserHomeCity(K_SAN, OTARU_CITY_ID)).resolves.toBe(false);
    const profile = await getUserProfile(K_SAN);
    expect(profile?.homeCityId).toBe(SAPPORO_CITY_ID);
    expect(profile?.homeCityChangedAt).toBeNull();
  });

  it("initializeUserHomeCity: 存在しない街は拒否する", async () => {
    const { overrideFixtureUserHomeCityForTest } = await import("./fixtures");
    const { initializeUserHomeCity } = await import("./mutations");
    overrideFixtureUserHomeCityForTest(K_SAN, null, null);

    await expect(initializeUserHomeCity(K_SAN, "no-such-city")).rejects.toThrow("街の情報が取得できませんでした");
  });

  it("initializeUserHomeCity: 2回続けて別の街を渡しても、2回目は変更にならない", async () => {
    const { overrideFixtureUserHomeCityForTest } = await import("./fixtures");
    const { initializeUserHomeCity } = await import("./mutations");
    const { getUserProfile } = await import("./spots");
    overrideFixtureUserHomeCityForTest(K_SAN, null, null);

    await expect(initializeUserHomeCity(K_SAN, OTARU_CITY_ID)).resolves.toBe(true);
    await expect(initializeUserHomeCity(K_SAN, SAPPORO_CITY_ID)).resolves.toBe(false);
    const profile = await getUserProfile(K_SAN);
    expect(profile?.homeCityId).toBe(OTARU_CITY_ID);
    expect(profile?.homeCityChangedAt).toBeNull();
  });
});
