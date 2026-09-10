// 書き込み系データアクセス（docs/CONTRACT.md 追補 2026-09-09 `src/lib/db/mutations.ts`）。
//
// T4 が暫定実装した `src/components/spot-form/db.ts`（削除しない。UI所有領域のため
// このファイルからは編集しない）のロジックを、CONTRACT追補のシグネチャに合わせて
// ここへ移植・統合する。主な差分:
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
import { nextStatus, nextVerificationDate, statusAfterAnswer } from "../domain/lifecycle";
import { pointsForAnswer } from "../domain/lantern";
import { isSupabaseConfigured } from "../supabase/env";
import { createClient } from "../supabase/server";
import { getSpot } from "./spots";
import {
  FIXTURE_BOOKMARKS,
  FIXTURE_CITIES,
  FIXTURE_ENDORSEMENT_LOG,
  FIXTURE_SPOTS,
  FIXTURE_VERIFICATIONS,
  FIXTURE_VERIFICATION_REQUESTS,
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
    const newStatus = nextStatus({ status: spot.status, createdAt: spot.createdAt }, null, spot.endorsementCount, now);
    if (newStatus !== spot.status) {
      spot.status = newStatus;
      if (newStatus === "published") {
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
    .eq("spot_id", spotId);
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
    const { error: updateError } = await supabase.from("spots").update(patch).eq("id", spotId);
    if (updateError) throw new Error(`ステータス更新に失敗しました: ${updateError.message}`);

    if (newStatus === "published") {
      const { error: requestError } = await supabase.from("verification_requests").insert({
        spot_id: spotId,
        user_id: spot.authorId,
        due_at: nextVerificationDate(now).toISOString(),
        status: "open",
      });
      if (requestError) throw new Error(`確認依頼の作成に失敗しました: ${requestError.message}`);
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

  const { error: requestUpdateError } = await supabase
    .from("verification_requests")
    .update({ status: "answered", answered_verification_id: (verificationRow as { id: string }).id })
    .eq("id", requestId);
  if (requestUpdateError) throw new Error(`確認依頼の更新に失敗しました: ${requestUpdateError.message}`);

  const newStatus = statusAfterAnswer(spot.status);
  const nextDueAt = nextVerificationDate(now).toISOString();
  const { error: spotUpdateError } = await supabase
    .from("spots")
    .update({
      quietness: answer,
      last_verified_at: now.toISOString(),
      next_verification_at: nextDueAt,
      status: newStatus,
    })
    .eq("id", spot.id);
  if (spotUpdateError) throw new Error(`確認結果の反映に失敗しました: ${spotUpdateError.message}`);

  const { error: nextRequestError } = await supabase.from("verification_requests").insert({
    spot_id: spot.id,
    user_id: spot.authorId,
    due_at: nextDueAt,
    status: "open",
  });
  if (nextRequestError) throw new Error(`次回確認依頼の作成に失敗しました: ${nextRequestError.message}`);

  const pointsAwarded = pointsForAnswer([], requestId);
  return { pointsAwarded, status: newStatus };
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
  const row = data as { id: string; user_id: string; spot_id: string; planned_at: string | null; created_at: string };
  const spot = await getSpot(row.spot_id);
  if (!spot) throw new Error("栞に追加したスポットの取得に失敗しました");
  return {
    id: row.id,
    userId: row.user_id,
    spotId: row.spot_id,
    plannedAt: row.planned_at,
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
