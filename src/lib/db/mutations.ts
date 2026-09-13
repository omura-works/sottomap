// 書き込み系データアクセス（docs/CONTRACT.md 追補 2026-09-09 `src/lib/db/mutations.ts`）。
//
// T4 が暫定実装した `src/components/spot-form/db.ts` のロジックを、
// CONTRACT追補のシグネチャに合わせてここへ移植・統合する。
//   - `verification_requests` テーブル（Spec §9.1）の生成・更新を追加した
//     （T4実装時点ではこのテーブルが契約に無かったため未対応だった）。
//   - `spots.location` は PostGIS の生成列ベースの geography(Point,4326) であり、
//     lat/lng は生成列（GENERATED ALWAYS AS STORED）のため直接 insert できない。
//     T4実装は `lat`/`lng` を直接 insert していたため実DBでは失敗する設計だった。
//     ここでは EWKT 文字列（'SRID=4326;POINT(lng lat)'）で location を insert する。
//   - ポイント付与の冪等性（Spec §9.6）を lantern.ts の pointsForAnswer/pointsForPublish 経由にした。
//
// Supabase未接続時はフィクスチャ（./fixtures.ts のインメモリ配列）を直接 mutate して反映する。

import type { Bookmark, Quietness, RequestStatus, Spot, SpotStatus, VisitFrequency } from "./types";
import {
  nextStatus,
  nextVerificationDate,
  PENDING_EXPIRY_DAYS,
  statusAfterAnswer,
} from "../domain/lifecycle";
import { pointsForAnswer, pointsForPublish } from "../domain/lantern";
import {
  planCronActions,
  type CronSpotInput,
  type CronVerificationRequestInput,
} from "../domain/verification-cron";
import { isSupabaseConfigured } from "../supabase/env";
import { createClient, createServiceRoleClient } from "../supabase/server";
import { getSpot } from "./spots";
import {
  FIXTURE_BOOKMARKS,
  FIXTURE_CITIES,
  FIXTURE_ENDORSEMENT_LOG,
  FIXTURE_SPOTS,
  FIXTURE_VERIFICATIONS,
  FIXTURE_VERIFICATION_REQUESTS,
  addFixtureLanternPoints,
  findFixtureSpot,
  findFixtureVerificationRequest,
  fixtureUserHomeCityId,
  fixtureUserProfile,
  hasFixtureEndorsement,
} from "./fixtures";

function newId(): string {
  return crypto.randomUUID();
}

// =========================================================
// createSpot: S5「ピンを立てる」
// =========================================================

export interface CreateSpotInput {
  cityId: string;
  name: string;
  reason: string;
  lat: number;
  lng: number;
  visitFrequency: VisitFrequency;
  authorId: string;
}

export async function createSpot(input: CreateSpotInput): Promise<Spot> {
  if (!isSupabaseConfigured()) {
    const city = FIXTURE_CITIES.find((c) => c.id === input.cityId);
    if (!city) throw new Error("街の情報が取得できませんでした");
    const author = fixtureUserProfile(input.authorId);
    const now = new Date().toISOString();
    const spot: Spot = {
      id: newId(),
      cityId: city.id,
      citySlug: city.slug,
      cityName: city.name,
      name: input.name,
      areaName: null,
      address: null,
      category: null,
      lat: input.lat,
      lng: input.lng,
      status: "pending",
      quietness: "quiet",
      reason: input.reason,
      visitFrequency: input.visitFrequency,
      authorId: input.authorId,
      authorLabel: author ? `${author.areaName ?? ""}に${author.residentYears ?? "?"}年、${author.displayName}` : null,
      photoUrl: null,
      tags: [],
      endorsementCount: 0,
      verifierCount: 0,
      lastVerifiedAt: null,
      nextVerificationAt: null,
      publishedAt: null,
      createdAt: now,
      distanceMeters: null,
      walkMinutes: null,
      openRequestId: null,
    };
    FIXTURE_SPOTS.push(spot);
    return spot;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spots")
    .insert({
      city_id: input.cityId,
      name: input.name,
      reason: input.reason,
      visit_frequency: input.visitFrequency,
      // spots.location は geography(Point,4326)。lat/lng は生成列（stored）のため直接 insert できない。
      // EWKT文字列は geography の型入力関数が直接解釈できる（PostGIS）。
      location: `SRID=4326;POINT(${input.lng} ${input.lat})`,
      author_id: input.authorId,
      status: "pending",
      quietness: "quiet",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`スポットの作成に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  const spot = await getSpot(String((data as { id: string }).id));
  if (!spot) throw new Error("作成したスポットの取得に失敗しました");
  return spot;
}

// =========================================================
// endorseSpot: 「行ったことがある」承認
// =========================================================

export async function endorseSpot(spotId: string, userId: string): Promise<{ published: boolean }> {
  if (!isSupabaseConfigured()) {
    const spot = findFixtureSpot(spotId);
    if (!spot) throw new Error("スポットが見つかりませんでした");
    if (spot.authorId === userId) {
      throw new Error("自分の投稿には「行ったことがある」を押せません");
    }
    if (spot.status !== "pending") {
      return { published: spot.status === "published" };
    }
    const homeCityId = fixtureUserHomeCityId(userId);
    if (homeCityId !== spot.cityId) {
      throw new Error("同じ街に住むユーザーのみ承認できます");
    }

    if (!hasFixtureEndorsement(spotId, userId)) {
      FIXTURE_ENDORSEMENT_LOG.push({ spotId, userId, createdAt: new Date().toISOString() });
      spot.endorsementCount += 1;
    }

    const now = new Date();
    const expiryAt = new Date(new Date(spot.createdAt).getTime() + PENDING_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const timelyEndorsementCount = FIXTURE_ENDORSEMENT_LOG.filter(
      (entry) => entry.spotId === spotId && new Date(entry.createdAt).getTime() <= expiryAt.getTime(),
    ).length;
    const newStatus = nextStatus({ status: spot.status, createdAt: spot.createdAt }, null, timelyEndorsementCount, now);
    if (newStatus !== spot.status) {
      spot.status = newStatus;
      if (newStatus === "published") {
        const pointsAwarded = pointsForPublish(spot.publishedAt === null);
        spot.publishedAt = now.toISOString();
        const dueAt = nextVerificationDate(now).toISOString();
        spot.nextVerificationAt = dueAt;
        const requestId = newId();
        FIXTURE_VERIFICATION_REQUESTS.push({
          id: requestId,
          spotId: spot.id,
          userId: spot.authorId,
          dueAt,
          status: "open",
          answeredVerificationId: null,
          createdAt: now.toISOString(),
        });
        spot.openRequestId = requestId;
        addFixtureLanternPoints(spot.authorId, pointsAwarded);
      }
    }

    return { published: spot.status === "published" };
  }

  const supabase = await createClient();
  const spot = await getSpot(spotId);
  if (!spot) throw new Error("スポットが見つかりませんでした");
  if (spot.authorId === userId) {
    throw new Error("自分の投稿には「行ったことがある」を押せません");
  }
  if (spot.status !== "pending") {
    return { published: spot.status === "published" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("endorsements")
    .select("id")
    .eq("spot_id", spotId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw new Error(`承認状況の取得に失敗しました: ${existingError.message}`);

  if (!existing) {
    const { error: insertError } = await supabase.from("endorsements").insert({ spot_id: spotId, user_id: userId });
    if (insertError) throw new Error(`承認の記録に失敗しました: ${insertError.message}`);
  }

  const { count, error: countError } = await supabase
    .from("endorsements")
    .select("id", { count: "exact", head: true })
    .eq("spot_id", spotId)
    .lte(
      "created_at",
      new Date(
        new Date(spot.createdAt).getTime() + PENDING_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString(),
    );
  if (countError) throw new Error(`承認数の取得に失敗しました: ${countError.message}`);
  const endorsementCount = count ?? spot.endorsementCount;

  const now = new Date();
  const newStatus = nextStatus({ status: spot.status, createdAt: spot.createdAt }, null, endorsementCount, now);
  if (newStatus !== spot.status) {
    const patch: Record<string, unknown> = { status: newStatus };
    if (newStatus === "published") {
      patch.published_at = now.toISOString();
      patch.next_verification_at = nextVerificationDate(now).toISOString();
    }
    const serviceClient = createServiceRoleClient();
    const { data: updatedRow, error: updateError } = await serviceClient
      .from("spots")
      .update(patch)
      .eq("id", spotId)
      .eq("status", spot.status)
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error(`ステータス更新に失敗しました: ${updateError.message}`);

    if (newStatus === "published" && updatedRow) {
      const { error: requestError } = await serviceClient.from("verification_requests").insert({
        spot_id: spotId,
        user_id: spot.authorId,
        due_at: nextVerificationDate(now).toISOString(),
        status: "open",
      });
      if (requestError) throw new Error(`確認依頼の作成に失敗しました: ${requestError.message}`);

      const pointsAwarded = pointsForPublish(spot.publishedAt === null);
      await addLanternPoints(serviceClient, spot.authorId, pointsAwarded);
    }
  }

  return { published: newStatus === "published" };
}

// =========================================================
// answerVerification: S6「確認」回答
// =========================================================

export interface AnswerVerificationResult {
  pointsAwarded: number;
  status: SpotStatus;
}

export async function answerVerification(
  requestId: string,
  userId: string,
  answer: Quietness,
  note?: string,
): Promise<AnswerVerificationResult> {
  if (!isSupabaseConfigured()) {
    const request = findFixtureVerificationRequest(requestId);
    if (!request) throw new Error("確認依頼が見つかりませんでした");
    if (request.userId !== userId) throw new Error("この確認依頼に回答する権限がありません");
    const spot = findFixtureSpot(request.spotId);
    if (!spot) throw new Error("対象スポットが見つかりませんでした");

    // Spec §9.6: 冪等性。既に answered/missed な依頼への再送は0ポイントで無視する。
    if (request.status !== "open") {
      return { pointsAwarded: 0, status: spot.status };
    }

    const now = new Date();
    const verificationId = newId();
    FIXTURE_VERIFICATIONS.push({
      id: verificationId,
      spotId: spot.id,
      userId,
      answer,
      note: note ?? null,
      createdAt: now.toISOString(),
    });

    request.status = "answered";
    request.answeredVerificationId = verificationId;

    spot.quietness = answer;
    spot.lastVerifiedAt = now.toISOString();
    spot.status = statusAfterAnswer(spot.status);

    const nextDueAt = nextVerificationDate(now).toISOString();
    spot.nextVerificationAt = nextDueAt;
    const nextRequestId = newId();
    FIXTURE_VERIFICATION_REQUESTS.push({
      id: nextRequestId,
      spotId: spot.id,
      userId: spot.authorId,
      dueAt: nextDueAt,
      status: "open",
      answeredVerificationId: null,
      createdAt: now.toISOString(),
    });
    spot.openRequestId = nextRequestId;

    const pointsAwarded = pointsForAnswer([], requestId); // status==='open' だったことが未付与の証跡
    addFixtureLanternPoints(userId, pointsAwarded);
    return { pointsAwarded, status: spot.status };
  }

  const supabase = await createClient();
  const { data: requestRow, error: requestError } = await supabase
    .from("verification_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (requestError) throw new Error(`確認依頼の取得に失敗しました: ${requestError.message}`);
  if (!requestRow) throw new Error("確認依頼が見つかりませんでした");

  const request = requestRow as { id: string; spot_id: string; user_id: string; status: RequestStatus };
  if (request.user_id !== userId) throw new Error("この確認依頼に回答する権限がありません");

  const spot = await getSpot(request.spot_id);
  if (!spot) throw new Error("対象スポットが見つかりませんでした");

  if (request.status !== "open") {
    return { pointsAwarded: 0, status: spot.status };
  }

  const now = new Date();
  const { data: verificationRow, error: verificationError } = await supabase
    .from("verifications")
    .insert({ spot_id: spot.id, user_id: userId, answer, note: note ?? null })
    .select("id")
    .single();
  if (verificationError || !verificationRow) {
    throw new Error(`確認の記録に失敗しました: ${verificationError?.message ?? "unknown error"}`);
  }

  const serviceClient = createServiceRoleClient();
  const { data: updatedRequest, error: requestUpdateError } = await serviceClient
    .from("verification_requests")
    .update({ status: "answered", answered_verification_id: (verificationRow as { id: string }).id })
    .eq("id", requestId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (requestUpdateError) throw new Error(`確認依頼の更新に失敗しました: ${requestUpdateError.message}`);
  if (!updatedRequest) {
    await serviceClient.from("verifications").delete().eq("id", (verificationRow as { id: string }).id);
    return { pointsAwarded: 0, status: spot.status };
  }

  const newStatus = statusAfterAnswer(spot.status);
  const nextDueAt = nextVerificationDate(now).toISOString();
  const { error: spotUpdateError } = await serviceClient
    .from("spots")
    .update({
      quietness: answer,
      last_verified_at: now.toISOString(),
      next_verification_at: nextDueAt,
      status: newStatus,
    })
    .eq("id", spot.id);
  if (spotUpdateError) throw new Error(`確認結果の反映に失敗しました: ${spotUpdateError.message}`);

  const { error: nextRequestError } = await serviceClient.from("verification_requests").insert({
    spot_id: spot.id,
    user_id: spot.authorId,
    due_at: nextDueAt,
    status: "open",
  });
  if (nextRequestError) throw new Error(`次回確認依頼の作成に失敗しました: ${nextRequestError.message}`);

  const pointsAwarded = pointsForAnswer([], requestId);
  await addLanternPoints(serviceClient, userId, pointsAwarded);
  return { pointsAwarded, status: newStatus };
}

async function addLanternPoints(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  points: number,
): Promise<void> {
  if (points === 0) return;
  const { data, error } = await supabase.from("users").select("lantern_points").eq("id", userId).single();
  if (error || !data) throw new Error(`灯りポイントの取得に失敗しました: ${error?.message ?? "unknown error"}`);
  const row = data as { lantern_points: number };
  const { error: updateError } = await supabase
    .from("users")
    .update({ lantern_points: row.lantern_points + points })
    .eq("id", userId);
  if (updateError) throw new Error(`灯りポイントの更新に失敗しました: ${updateError.message}`);
}

export interface VerificationCronResult {
  checked: number;
  changed: number;
  missedRequestCount: number;
  createdRequestCount: number;
}

/** verification_requests を基準に期限処理と次回依頼生成を一括実行する。 */
export async function runVerificationCron(now: Date): Promise<VerificationCronResult> {
  if (!isSupabaseConfigured()) {
    const spots: CronSpotInput[] = FIXTURE_SPOTS.filter((spot) =>
      spot.status === "pending" || spot.status === "published",
    ).map((spot) => ({
      id: spot.id,
      authorId: spot.authorId,
      status: spot.status,
      createdAt: spot.createdAt,
      publishedAt: spot.publishedAt,
      endorsementCreatedAts: FIXTURE_ENDORSEMENT_LOG.filter((entry) => entry.spotId === spot.id).map(
        (entry) => entry.createdAt,
      ),
    }));
    const requests: CronVerificationRequestInput[] = FIXTURE_VERIFICATION_REQUESTS.filter(
      (request) => request.status === "open",
    );
    const plan = planCronActions(spots, requests, now);
    let changed = 0;
    let missedRequestCount = 0;
    let createdRequestCount = 0;
    const missedSpotIds = new Set<string>();

    for (const action of plan.requestActions) {
      const request = findFixtureVerificationRequest(action.id);
      if (request?.status !== action.from) continue;
      request.status = action.to;
      const spot = findFixtureSpot(request.spotId);
      if (spot) spot.openRequestId = null;
      missedSpotIds.add(request.spotId);
      missedRequestCount += 1;
      changed += 1;
    }
    for (const action of plan.spotActions) {
      const spot = findFixtureSpot(action.id);
      if (!spot || spot.status !== action.from) continue;
      if (action.to === "dormant" && !missedSpotIds.has(action.id)) continue;
      const pointsAwarded = action.to === "published" ? pointsForPublish(spot.publishedAt === null) : 0;
      spot.status = action.to;
      if (action.to === "published") {
        spot.publishedAt = now.toISOString();
        addFixtureLanternPoints(spot.authorId, pointsAwarded);
      }
      changed += 1;
    }
    for (const item of plan.requestsToCreate) {
      const alreadyOpen = FIXTURE_VERIFICATION_REQUESTS.some(
        (request) => request.spotId === item.spotId && request.status === "open",
      );
      if (alreadyOpen) continue;
      const id = newId();
      FIXTURE_VERIFICATION_REQUESTS.push({
        id,
        spotId: item.spotId,
        userId: item.userId,
        dueAt: item.dueAt,
        status: "open",
        answeredVerificationId: null,
        createdAt: now.toISOString(),
      });
      const spot = findFixtureSpot(item.spotId);
      if (spot) {
        spot.openRequestId = id;
        spot.nextVerificationAt = item.dueAt;
      }
      createdRequestCount += 1;
      changed += 1;
    }

    return { checked: spots.length, changed, missedRequestCount, createdRequestCount };
  }

  const supabase = createServiceRoleClient();
  const [{ data: spotRows, error: spotError }, { data: requestRows, error: requestError }] = await Promise.all([
    supabase
      .from("spots")
      .select("id, author_id, status, created_at, published_at, endorsements(created_at)")
      .in("status", ["pending", "published"]),
    supabase.from("verification_requests").select("id, spot_id, due_at, status").eq("status", "open"),
  ]);
  if (spotError) throw new Error(`cron対象スポットの取得に失敗しました: ${spotError.message}`);
  if (requestError) throw new Error(`cron対象依頼の取得に失敗しました: ${requestError.message}`);

  type CronSpotRow = {
    id: string;
    author_id: string;
    status: SpotStatus;
    created_at: string;
    published_at: string | null;
    endorsements: Array<{ created_at: string }> | { created_at: string } | null;
  };
  type CronRequestRow = { id: string; spot_id: string; due_at: string; status: RequestStatus };
  const spots: CronSpotInput[] = ((spotRows ?? []) as CronSpotRow[]).map((row) => ({
    id: row.id,
    authorId: row.author_id,
    status: row.status,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    endorsementCreatedAts: row.endorsements
      ? (Array.isArray(row.endorsements) ? row.endorsements : [row.endorsements]).map((item) => item.created_at)
      : [],
  }));
  const requests: CronVerificationRequestInput[] = ((requestRows ?? []) as CronRequestRow[]).map((row) => ({
    id: row.id,
    spotId: row.spot_id,
    dueAt: row.due_at,
    status: row.status,
  }));
  const plan = planCronActions(spots, requests, now);
  let changed = 0;
  let missedRequestCount = 0;
  let createdRequestCount = 0;
  const missedSpotIds = new Set<string>();
  const requestSpotIdById = new Map(requests.map((request) => [request.id, request.spotId]));

  for (const action of plan.requestActions) {
    const { data, error } = await supabase
      .from("verification_requests")
      .update({ status: action.to })
      .eq("id", action.id)
      .eq("status", action.from)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`確認依頼の期限切れ更新に失敗しました: ${error.message}`);
    if (data) {
      const spotId = requestSpotIdById.get(action.id);
      if (spotId) missedSpotIds.add(spotId);
      missedRequestCount += 1;
      changed += 1;
    }
  }
  for (const action of plan.spotActions) {
    if (action.to === "dormant" && !missedSpotIds.has(action.id)) continue;
    const input = spots.find((spot) => spot.id === action.id);
    const patch: Record<string, unknown> = { status: action.to };
    if (action.to === "published") patch.published_at = now.toISOString();
    const { data, error } = await supabase
      .from("spots")
      .update(patch)
      .eq("id", action.id)
      .eq("status", action.from)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`スポットの期限更新に失敗しました: ${error.message}`);
    if (!data) continue;
    if (action.to === "published" && input) {
      await addLanternPoints(supabase, input.authorId, pointsForPublish(input.publishedAt === null));
    }
    changed += 1;
  }
  for (const item of plan.requestsToCreate) {
    const { error } = await supabase.from("verification_requests").insert({
      spot_id: item.spotId,
      user_id: item.userId,
      due_at: item.dueAt,
      status: "open",
    });
    if (error?.code === "23505") continue;
    if (error) throw new Error(`次回確認依頼の作成に失敗しました: ${error.message}`);
    const { error: spotUpdateError } = await supabase
      .from("spots")
      .update({ next_verification_at: item.dueAt })
      .eq("id", item.spotId);
    if (spotUpdateError) throw new Error(`次回確認日の更新に失敗しました: ${spotUpdateError.message}`);
    createdRequestCount += 1;
    changed += 1;
  }

  return { checked: spots.length, changed, missedRequestCount, createdRequestCount };
}

// =========================================================
// 栞（bookmarks）
// =========================================================

export async function addBookmark(userId: string, spotId: string, plannedAt?: string): Promise<Bookmark> {
  if (!isSupabaseConfigured()) {
    const existing = FIXTURE_BOOKMARKS.find((b) => b.userId === userId && b.spotId === spotId);
    if (existing) return existing;
    const spot = findFixtureSpot(spotId);
    if (!spot) throw new Error("スポットが見つかりませんでした");
    const bookmark: Bookmark = {
      id: newId(),
      userId,
      spotId,
      plannedAt: plannedAt ?? null,
      meta: null,
      createdAt: new Date().toISOString(),
      spot,
    };
    FIXTURE_BOOKMARKS.push(bookmark);
    return bookmark;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookmarks")
    .upsert(
      { user_id: userId, spot_id: spotId, planned_at: plannedAt ?? null },
      { onConflict: "user_id,spot_id" },
    )
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`栞への追加に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  const row = data as {
    id: string;
    user_id: string;
    spot_id: string;
    planned_at: string | null;
    meta: string | null;
    created_at: string;
  };
  const spot = await getSpot(row.spot_id);
  if (!spot) throw new Error("栞に追加したスポットの取得に失敗しました");
  return {
    id: row.id,
    userId: row.user_id,
    spotId: row.spot_id,
    plannedAt: row.planned_at,
    meta: row.meta,
    createdAt: row.created_at,
    spot,
  };
}

export async function removeBookmark(userId: string, spotId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const index = FIXTURE_BOOKMARKS.findIndex((b) => b.userId === userId && b.spotId === spotId);
    if (index >= 0) FIXTURE_BOOKMARKS.splice(index, 1);
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("bookmarks").delete().eq("user_id", userId).eq("spot_id", spotId);
  if (error) throw new Error(`栞の削除に失敗しました: ${error.message}`);
}

/** /start で選んだ街を、ログイン済みユーザーの居住街として保存する。 */
export async function setUserHomeCity(userId: string, cityId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ home_city_id: cityId }).eq("id", userId);
  if (error) throw new Error(`居住街の保存に失敗しました: ${error.message}`);
}
