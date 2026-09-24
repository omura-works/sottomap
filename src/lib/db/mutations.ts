// 書き込み系データアクセス（docs/CONTRACT.md 追補 2026-09-09 `src/lib/db/mutations.ts`）。
//
// Spec §9.13.2（2026-09-14）: 状態・時刻・ポイントを変える書き込みは利用者に直接させない。
//   - Supabase 経路は、0006_security_hardening.sql の DB 関数（security definer・行ロック下で再検査）を
//     **本人のセッションの接続**（createClient）で `rpc()` するだけにする。
//     authenticated ロールからは spots / endorsements / verifications / verification_requests /
//     lantern_events への直接の書き込み権限が取り上げられている。
//   - service-role の接続（createServiceRoleClient）は cron（run_verification_cron）だけが使う。
//   - デモモード（Spec §9.13.1。URASUPO_DEMO_MODE=1 のときだけ）は、フィクスチャ（./fixtures.ts の
//     インメモリ配列）に **DB 関数と同じ規則** を実装して反映する。Vitest はこの経路で規則を検証する。

import { z } from "zod";
import type { Bookmark, Quietness, Spot, SpotStatus, VisitFrequency } from "./types";
import {
  answerEligibility,
  canPublish,
  isEndorsementOnTime,
  latestMissedRequestId,
  nextVerificationDate,
  statusAfterAnswer,
} from "../domain/lifecycle";
import { formatAuthorLabel } from "../domain/author-label";
import { validateDisplayName } from "../domain/display-name";
import { POINTS_PER_PUBLISHED_SPOT, POINTS_PER_VERIFICATION } from "../domain/lantern";
import { planCronActions, type CronSpotInput, type CronVerificationRequestInput } from "../domain/verification-cron";
import { isSupabaseConfigured } from "../supabase/env";
import { createClient, createServiceRoleClient } from "../supabase/server";
import { callWithSingleTransactionRetry } from "./retry";
import { getSpot } from "./spots";
import {
  FIXTURE_BOOKMARKS,
  FIXTURE_CITIES,
  FIXTURE_ENDORSEMENT_LOG,
  FIXTURE_SPOTS,
  FIXTURE_VERIFICATIONS,
  FIXTURE_VERIFICATION_REQUESTS,
  awardFixtureLanternPoints,
  findFixtureSpot,
  findFixtureVerificationRequest,
  fixtureUserHomeCityId,
  fixtureUserProfile,
  hasFixtureEndorsement,
  initializeFixtureUserHomeCity,
  setFixtureUserDisplayName,
  setFixtureUserHomeCity,
} from "./fixtures";

function newId(): string {
  return crypto.randomUUID();
}

const SPOT_STATUSES = ["pending", "published", "dormant", "expired"] as const;

/** Supabase の rpc() が返した error を、画面にそのまま出せる日本語の例外にする。 */
function rpcError(context: string, error: { message: string } | null): Error {
  return new Error(error?.message ? error.message : `${context}に失敗しました`);
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
  /** デモモード（フィクスチャ）でのみ使う。Supabase 経路の投稿者は DB が auth.uid() から決める。 */
  authorId: string;
}

const createSpotResultSchema = z.string().min(1);

const VISIT_FREQUENCIES: readonly VisitFrequency[] = ["weekly", "monthly", "yearly"];

/** PostgreSQL の char_length と同じく、コードポイント単位で数える。 */
function charLength(value: string): number {
  return Array.from(value).length;
}

/**
 * create_spot（0006）と同じ入力検証。検査の順序とエラー文も DB 関数に合わせる。
 * 戻り値は DB が保存する形（名前は前後の空白を除く。理由はそのまま）。
 */
export function validateCreateSpotInput(input: Pick<CreateSpotInput, "name" | "reason" | "lat" | "lng" | "visitFrequency">): {
  name: string;
  reason: string;
} {
  // btrim は空白（U+0020）だけを除く。
  const name = input.name.replace(/^ +| +$/g, "");
  if (charLength(name) === 0 || charLength(name) > 80) {
    throw new Error("店の名前は80字以内で入力してください");
  }
  if (charLength(input.reason.replace(/^ +| +$/g, "")) === 0 || charLength(input.reason) > 60) {
    throw new Error("なぜここへ行くのかを60字以内で入力してください");
  }
  if (!VISIT_FREQUENCIES.includes(input.visitFrequency)) {
    throw new Error("行く頻度を選んでください");
  }
  const { lat, lng } = input;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("場所を選んでください");
  }
  return { name, reason: input.reason };
}

export async function createSpot(input: CreateSpotInput): Promise<Spot> {
  if (!isSupabaseConfigured()) {
    const city = FIXTURE_CITIES.find((c) => c.id === input.cityId);
    if (!city) throw new Error("街の情報が取得できませんでした");
    // create_spot と同じ規則: 投稿者の居住街と投稿先の街が一致すること（地元の人だけ）。
    if (fixtureUserHomeCityId(input.authorId) !== city.id) {
      throw new Error("住んでいる街にだけピンを立てられます");
    }
    const { name, reason } = validateCreateSpotInput(input);
    const author = fixtureUserProfile(input.authorId);
    const now = new Date().toISOString();
    const spot: Spot = {
      id: newId(),
      cityId: city.id,
      citySlug: city.slug,
      cityName: city.name,
      name,
      areaName: null,
      address: null,
      category: null,
      lat: input.lat,
      lng: input.lng,
      status: "pending",
      quietness: "quiet",
      reason,
      visitFrequency: input.visitFrequency,
      authorId: input.authorId,
      authorLabel: author ? formatAuthorLabel(author) : null,
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

  // DB 関数も同じ検査をするが、通信の前に同じ文言で弾いておく（居住街の検査は DB だけが行える）。
  validateCreateSpotInput(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_spot", {
    p_city_id: input.cityId,
    p_name: input.name,
    p_reason: input.reason,
    p_lat: input.lat,
    p_lng: input.lng,
    p_visit_frequency: input.visitFrequency,
  });
  if (error) throw rpcError("スポットの作成", error);
  const parsed = createSpotResultSchema.safeParse(data);
  if (!parsed.success) throw new Error("スポットの作成結果を読み取れませんでした");

  const spot = await getSpot(parsed.data);
  if (!spot) throw new Error("作成したスポットの取得に失敗しました");
  return spot;
}

// =========================================================
// endorseSpot: 「行ったことがある」承認
// =========================================================

const endorseResultSchema = z.object({
  status: z.enum(SPOT_STATUSES),
  endorsementCount: z.number().int(),
  published: z.boolean(),
});

/** 公開への遷移（endorse_spot / run_verification_cron の publish_pending_spot と同じ処理）。 */
function publishFixtureSpot(spot: Spot, now: Date): void {
  const firstPublish = spot.publishedAt === null;
  spot.status = "published";
  spot.publishedAt = spot.publishedAt ?? now.toISOString();
  const dueAt = nextVerificationDate(now).toISOString();
  spot.nextVerificationAt = dueAt;
  const hasOpen = FIXTURE_VERIFICATION_REQUESTS.some((r) => r.spotId === spot.id && r.status === "open");
  if (!hasOpen) {
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
  // 公開 +10 は spots.id につき一度だけ（台帳の一意制約）。初めて published_at が入るときだけ。
  if (firstPublish) {
    awardFixtureLanternPoints(spot.authorId, "publish", spot.id, POINTS_PER_PUBLISHED_SPOT, now);
  }
}

/** 期限内に成立した承認の人数（投稿者本人は除く）。 */
function timelyFixtureEndorsementCount(spot: Spot): number {
  return FIXTURE_ENDORSEMENT_LOG.filter(
    (entry) =>
      entry.spotId === spot.id && entry.userId !== spot.authorId && isEndorsementOnTime(spot.createdAt, entry.createdAt),
  ).length;
}

export async function endorseSpot(spotId: string, userId: string): Promise<{ published: boolean }> {
  if (!isSupabaseConfigured()) {
    // endorse_spot と同じ順序で検査する: 存在 → 本人の投稿でない → 同じ街 → 状態 → 期限。
    const spot = findFixtureSpot(spotId);
    if (!spot) throw new Error("スポットが見つかりませんでした");
    if (spot.authorId === userId) {
      throw new Error("自分の投稿には「行ったことがある」を押せません");
    }
    if (fixtureUserHomeCityId(userId) !== spot.cityId) {
      throw new Error("同じ街に住むユーザーのみ承認できます");
    }
    if (spot.status !== "pending" && spot.status !== "expired") {
      throw new Error("このピンは承認を受け付けていません");
    }
    const now = new Date();
    // Spec §9.13.5: 期限は絶対時刻。期限を過ぎた承認は受け付けない。
    // expired でも承認時刻が期限内なら受け付ける（DB では cron が先にロックを取った場合に起こる）。
    if (!isEndorsementOnTime(spot.createdAt, now)) {
      throw new Error("承認の期限を過ぎています");
    }

    if (!hasFixtureEndorsement(spotId, userId)) {
      FIXTURE_ENDORSEMENT_LOG.push({ spotId, userId, createdAt: now.toISOString() });
      spot.endorsementCount += 1;
    }

    const published = canPublish(timelyFixtureEndorsementCount(spot));
    if (published) publishFixtureSpot(spot, now);
    return { published };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("endorse_spot", { p_spot_id: spotId });
  if (error) throw rpcError("承認の記録", error);
  const parsed = endorseResultSchema.safeParse(data);
  if (!parsed.success) throw new Error("承認の結果を読み取れませんでした");
  return { published: parsed.data.published };
}

// =========================================================
// answerVerification: S6「確認」回答
// =========================================================

export interface AnswerVerificationResult {
  /** 今回の回答を受理したか。同じ依頼への再送（二重送信）は受理せず false。 */
  accepted: boolean;
  pointsAwarded: number;
  status: SpotStatus;
}

const answerResultSchema = z.object({
  accepted: z.boolean(),
  pointsAwarded: z.number().int(),
  status: z.enum(SPOT_STATUSES),
});

export const NOT_DUE_ERROR_MESSAGE = "この確認はまだ届いていません";
export const CLOSED_REQUEST_ERROR_MESSAGE = "この確認依頼には、もう回答できません";

/** 確認の備考の上限（answer_verification と同じ。0012）。文字数はコードポイントで数える（DB の char_length と同じ）。 */
export const VERIFICATION_NOTE_MAX_LENGTH = 500;
export const NOTE_TOO_LONG_ERROR_MESSAGE = `備考は${VERIFICATION_NOTE_MAX_LENGTH}文字以内で入力してください`;

export async function answerVerification(
  requestId: string,
  userId: string,
  answer: Quietness,
  note?: string,
): Promise<AnswerVerificationResult> {
  if (note !== undefined && [...note].length > VERIFICATION_NOTE_MAX_LENGTH) {
    throw new Error(NOTE_TOO_LONG_ERROR_MESSAGE);
  }
  if (!isSupabaseConfigured()) {
    const request = findFixtureVerificationRequest(requestId);
    // answer_verification と同じく、他人宛ての依頼は「見つからない」と同じ扱いにする。
    if (!request || request.userId !== userId) throw new Error("確認依頼が見つかりませんでした");
    const spot = findFixtureSpot(request.spotId);
    if (!spot) throw new Error("対象スポットが見つかりませんでした");

    // Spec §9.6 / §9.13.3: 同じ依頼は二度と受理しない。再送は記録も加算もせずに返す。
    if (request.status === "answered") {
      return { accepted: false, pointsAwarded: 0, status: spot.status };
    }

    const now = new Date();
    const eligibility = answerEligibility(
      request,
      spot.status,
      latestMissedRequestId(FIXTURE_VERIFICATION_REQUESTS, spot.id),
      now,
    );
    if (eligibility === "not-due") throw new Error(NOT_DUE_ERROR_MESSAGE);
    if (eligibility !== "answerable") throw new Error(CLOSED_REQUEST_ERROR_MESSAGE);

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
    if (spot.status === "published" && !hasOpenFixtureRequest(spot.id)) {
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
    }

    // 確認 +5 は verification_requests.id につき一度だけ（台帳の一意制約）。
    const pointsAwarded = awardFixtureLanternPoints(userId, "verification", request.id, POINTS_PER_VERIFICATION, now);
    return { accepted: true, pointsAwarded, status: spot.status };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("answer_verification", {
    p_request_id: requestId,
    p_answer: answer,
    p_note: note ?? null,
  });
  if (error) throw rpcError("確認の記録", error);
  const parsed = answerResultSchema.safeParse(data);
  if (!parsed.success) throw new Error("確認の結果を読み取れませんでした");
  return parsed.data;
}

function hasOpenFixtureRequest(spotId: string): boolean {
  return FIXTURE_VERIFICATION_REQUESTS.some((request) => request.spotId === spotId && request.status === "open");
}

// =========================================================
// runVerificationCron: 期限処理と次回依頼（Vercel Cron）
// =========================================================

export interface VerificationCronResult {
  checked: number;
  changed: number;
  missedRequestCount: number;
  createdRequestCount: number;
  /** 回答・承認がロック中だったため今回は飛ばし、次回の cron に回したスポットの数（Spec §9.13.8） */
  skippedLockedCount: number;
}

const cronResultSchema = z.object({
  checked: z.number().int(),
  changed: z.number().int(),
  missedRequestCount: z.number().int(),
  createdRequestCount: z.number().int(),
  skippedLockedCount: z.number().int(),
});

/**
 * verification_requests を基準に期限処理と次回依頼生成を一括実行する。
 * Supabase 経路では DB 関数 run_verification_cron（service_role 専用、DB の now() を使う）を呼ぶため、
 * 引数の now はデモモード（フィクスチャ）でだけ使う。
 */
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
      endorsementCreatedAts: FIXTURE_ENDORSEMENT_LOG.filter(
        (entry) => entry.spotId === spot.id && entry.userId !== spot.authorId,
      ).map((entry) => entry.createdAt),
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
      if (action.to === "published") {
        // 期限前に2人の承認が成立していれば、cron の実行が期限後でも公開を優先する（§9.13.5）。
        const hadOpen = hasOpenFixtureRequest(spot.id);
        publishFixtureSpot(spot, now);
        if (!hadOpen && hasOpenFixtureRequest(spot.id)) {
          createdRequestCount += 1;
          changed += 1;
        }
      } else {
        spot.status = action.to;
      }
      changed += 1;
    }
    for (const item of plan.requestsToCreate) {
      if (hasOpenFixtureRequest(item.spotId)) continue;
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

    // フィクスチャは同時実行が無いので、ロック中で飛ばすスポットは常に0
    return { checked: spots.length, changed, missedRequestCount, createdRequestCount, skippedLockedCount: 0 };
  }

  // service-role はここ（cron）だけで使う。DB 関数は service_role にしか EXECUTE を与えていない。
  // デッドロック（40P01）・直列化失敗（40001）のときだけ1回再実行する（Spec §9.13.8）。
  const supabase = createServiceRoleClient();
  const { data, error } = await callWithSingleTransactionRetry(() => supabase.rpc("run_verification_cron"));
  if (error) throw rpcError("確認の定期処理", error);
  const parsed = cronResultSchema.safeParse(data);
  if (!parsed.success) throw new Error("確認の定期処理の結果を読み取れませんでした");
  return parsed.data;
}

// =========================================================
// 栞（bookmarks）
// =========================================================

export async function addBookmark(userId: string, spotId: string, plannedAt?: string): Promise<Bookmark> {
  if (!isSupabaseConfigured()) {
    const spot = findFixtureSpot(spotId);
    if (!spot) throw new Error("スポットが見つかりませんでした");
    const existing = FIXTURE_BOOKMARKS.find((b) => b.userId === userId && b.spotId === spotId);
    if (existing) {
      // DB の upsert（on conflict (user_id, spot_id)）と同じく、送った列（予定日）だけを上書きする。
      // id・作成日時・メタ文言は既存行のまま。
      existing.plannedAt = plannedAt ?? null;
      existing.spot = spot;
      return existing;
    }
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

/**
 * 住んでいる街を設定・変更する（SPEC §9.16）。
 * Supabase 経路は DB 関数 set_home_city（0007_home_city_change_limit.sql）を本人のセッションで呼ぶだけ
 * （authenticated は users.home_city_id を直接書き換えられない）。対象は常にログイン中の本人（auth.uid()）。
 * デモモードはフィクスチャに同じ規則（初回は数えない・同じ街は何もしない・別の街は90日に1回まで）を再現する。
 * 戻り値は記録された変更時刻（初回設定・未変更のままなら null）。
 */
export async function setUserHomeCity(userId: string, cityId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return setFixtureUserHomeCity(userId, cityId);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_home_city", { p_city_id: cityId });
  if (error) throw rpcError("住んでいる街の保存", error);
  return typeof data === "string" ? data : null;
}

/**
 * 住んでいる街の初回設定（SPEC §9.16-1。/start の「歩きはじめる」専用）。
 * Supabase 経路は DB 関数 initialize_home_city を本人のセッションで呼ぶだけ。関数が本人の行を for update で
 * ロックしてから「未設定か」を判断するため、2タブから同時に呼んでも後続が「変更」として成立しない。
 * 戻り値: 設定したら true、設定済みで何もしなかったら false。
 */
export async function initializeUserHomeCity(userId: string, cityId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return initializeFixtureUserHomeCity(userId, cityId);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("initialize_home_city", { p_city_id: cityId });
  if (error) throw rpcError("住んでいる街の保存", error);
  return data === true;
}

// =========================================================
// setUserDisplayName: /me の表示名の変更（SPEC §9.18-1）
// =========================================================

/**
 * 表示名を変える。前後の空白を除いた、保存した名前を返す。
 * 規則（1〜20文字・改行や制御文字なし・メールアドレスの形なし）は validateDisplayName と
 * DB 関数 set_display_name の両方が同じ文言で強制する。利用者は users.display_name を直接書き換えられない。
 */
export async function setUserDisplayName(userId: string, rawName: string): Promise<string> {
  const checked = validateDisplayName(rawName);
  if (!checked.ok) throw new Error(checked.message);

  if (!isSupabaseConfigured()) {
    return setFixtureUserDisplayName(userId, checked.name);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_display_name", { p_name: checked.name });
  if (error) throw rpcError("表示名の保存", error);
  return typeof data === "string" ? data : checked.name;
}
