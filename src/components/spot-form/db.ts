// T4（投稿フローと90日検証）所有の書き込み専用データアクセス。
//
// docs/CONTRACT.md の `src/lib/db/spots.ts` は読み取り関数のみを定義しており、
// 投稿・承認・確認回答・cron の書き込み系関数が無い。`src/lib/**` は T2 の
// 所有領域で書き換えられないため、ここ（T4 所有の `src/components/spot-form/**`）
// に直接 Supabase を叩く最小限の書き込み関数を置く。
// 本来は `src/lib/db/spots.ts` に集約されるのが望ましく、報告に追記の要望を書く。

import { createClient } from "@/lib/supabase/server";
import type { Quietness, SpotStatus, VisitFrequency } from "@/lib/db/types";
import { nextVerificationDate } from "@/lib/domain/lifecycle";
import { isWinterMonth, type LanternInput } from "@/lib/domain/lantern";

export interface CreatePendingSpotInput {
  cityId: string;
  name: string;
  reason: string;
  visitFrequency: VisitFrequency;
  lat: number;
  lng: number;
  authorId: string;
}

/** S5「ピンを立てる」: spots に status='pending' として1件作成する。 */
export async function createPendingSpot(input: CreatePendingSpotInput): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spots")
    .insert({
      city_id: input.cityId,
      name: input.name,
      reason: input.reason,
      visit_frequency: input.visitFrequency,
      lat: input.lat,
      lng: input.lng,
      author_id: input.authorId,
      status: "pending",
      quietness: "quiet",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`スポットの作成に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return { id: String(data.id) };
}

/** すでに承認済みか（同じユーザーの二重承認を防ぐ）。 */
export async function hasEndorsed(spotId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("endorsements")
    .select("id")
    .eq("spot_id", spotId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`承認状況の取得に失敗しました: ${error.message}`);
  return data !== null;
}

/** 「行ったことがある」承認を1件記録する。 */
export async function createEndorsement(spotId: string, userId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("endorsements").insert({ spot_id: spotId, user_id: userId });
  if (error) throw new Error(`承認の記録に失敗しました: ${error.message}`);
}

/** cron / 承認フロー共通のステータス更新。published へ遷移する際は公開日と次回確認日を設定する。 */
export async function updateSpotStatus(spotId: string, status: SpotStatus, now: Date): Promise<void> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "published") {
    patch.published_at = now.toISOString();
    patch.next_verification_at = nextVerificationDate(now).toISOString();
  }
  const { error } = await supabase.from("spots").update(patch).eq("id", spotId);
  if (error) throw new Error(`ステータス更新に失敗しました: ${error.message}`);
}

/** S6 確認: verifications に1件記録する。 */
export async function createVerificationRecord(spotId: string, userId: string, answer: Quietness): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("verifications").insert({ spot_id: spotId, user_id: userId, answer });
  if (error) throw new Error(`確認の記録に失敗しました: ${error.message}`);
}

/**
 * 確認回答を spots に反映する。次回確認日を90日後にリセットし、
 * dormant だった場合も published に復帰させる（SPEC §2.2）。
 */
export async function applyVerificationResult(spotId: string, quietness: Quietness, now: Date): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("spots")
    .update({
      quietness,
      last_verified_at: now.toISOString(),
      next_verification_at: nextVerificationDate(now).toISOString(),
      status: "published",
    })
    .eq("id", spotId);
  if (error) throw new Error(`確認結果の反映に失敗しました: ${error.message}`);
}

/** lantern.ts の resolveBadges / totalPoints に渡す集計値を1ユーザー分まとめる。 */
export async function getLanternInputForUser(userId: string): Promise<LanternInput> {
  const supabase = await createClient();

  const { data: verifications, error: verificationsError } = await supabase
    .from("verifications")
    .select("created_at")
    .eq("user_id", userId);
  if (verificationsError) {
    throw new Error(`確認回数の取得に失敗しました: ${verificationsError.message}`);
  }

  const verificationRows = (verifications ?? []) as Array<{ created_at: string }>;
  const verificationCount = verificationRows.length;
  const winterVerificationCount = verificationRows.filter((v) => isWinterMonth(v.created_at)).length;

  const { data: publishedSpots, error: spotsError } = await supabase
    .from("spots")
    .select("id, cities(is_port)")
    .eq("author_id", userId)
    .eq("status", "published");
  if (spotsError) {
    throw new Error(`公開ピン数の取得に失敗しました: ${spotsError.message}`);
  }

  type PublishedSpotRow = { id: string; cities: { is_port: boolean } | { is_port: boolean }[] | null };
  const publishedRows = (publishedSpots ?? []) as PublishedSpotRow[];
  const publishedSpotCount = publishedRows.length;
  const publishedPortSpotCount = publishedRows.filter((row) => {
    const city = row.cities;
    if (Array.isArray(city)) return city[0]?.is_port === true;
    return city?.is_port === true;
  }).length;

  return { verificationCount, winterVerificationCount, publishedPortSpotCount, publishedSpotCount };
}

export interface CronSpotRow {
  id: string;
  status: SpotStatus;
  createdAt: string;
  nextVerificationAt: string | null;
  endorsementCount: number;
}

/** cron 用: pending / published のスポットを承認数つきで取得する。 */
export async function listSpotsForCron(): Promise<CronSpotRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spots")
    .select("id, status, created_at, next_verification_at, endorsements(count)")
    .in("status", ["pending", "published"]);
  if (error) throw new Error(`cron対象スポットの取得に失敗しました: ${error.message}`);

  type Row = {
    id: string;
    status: SpotStatus;
    created_at: string;
    next_verification_at: string | null;
    endorsements: { count: number }[] | { count: number } | null;
  };

  return ((data ?? []) as Row[]).map((row) => {
    const endorsements = row.endorsements;
    const endorsementCount = Array.isArray(endorsements) ? (endorsements[0]?.count ?? 0) : (endorsements?.count ?? 0);
    return {
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      nextVerificationAt: row.next_verification_at,
      endorsementCount,
    };
  });
}
