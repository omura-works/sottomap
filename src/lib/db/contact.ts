// お問い合わせの保存（docs/SPEC.md §9.17）。
//
// 保存先は public.contact_messages（0009_contact_messages.sql・0010_contact_hardening.sql）。
// 書き込みは security definer の RPC `submit_contact_message` だけで、その EXECUTE は service_role にしか無い
// （公開 RPC を直接呼んで回数制限を迂回できないようにするため）。ここ（サーバー）から service_role の接続で呼ぶ。
// 送信元は IP そのものを渡さず、sha256(送信元IP + CONTACT_RATE_SALT) の16進だけを渡す。
// デモモード（URASUPO_DEMO_MODE=1。SPEC §9.13.1）は DB を持たないので、同じ規則（回数制限を除く）を
// フィクスチャ（インメモリ配列。プロセスが終われば消える）で再現するだけで、どこにも保存しない。
// 入力検査と文言は @/app/contact/schema（画面と共有する）にある。

import { createHash } from "node:crypto";
import { isSupabaseConfigured } from "../supabase/env";
import { createServiceRoleClient } from "../supabase/server";
import { validateContactMessageInput, type ContactCategory } from "@/app/contact/schema";
import { addFixtureContactMessage, purgeFixtureContactMessages } from "./fixtures";

/** 保存に失敗したときの既定の文言（利用者には Server Action が汎用の文言に置き換える）。 */
const SUBMIT_FAILED = "お問い合わせの送信に失敗しました";

export interface ContactSubmission {
  category: string | null;
  message: string;
  replyTo: string | null;
  spotId: string | null;
  /** ログイン中の利用者の ID。未ログインなら null。 */
  requesterId: string | null;
  /** ブラウザの User-Agent（Server Action が200字で切って渡す）。 */
  userAgent: string | null;
  /** 送信元の IP。ハッシュにしてから DB に渡し、そのものは保存しない。取れなければ null。 */
  sourceIp: string | null;
}

export interface ContactReceipt {
  id: string;
  category: ContactCategory;
  /** 受付時刻（ISO 8601）。 */
  receivedAt: string;
}

/** 送信元のハッシュ（sha256(送信元IP + ソルト) の16進64文字）。IP が取れないときは同じ1つの送信元として扱う。 */
export function hashContactSource(sourceIp: string | null, salt: string): string {
  return createHash("sha256")
    .update(`${sourceIp ?? "unknown"}${salt}`)
    .digest("hex");
}

/**
 * お問い合わせを1件受け付ける（SPEC §9.17）。
 * 戻り値は受付の記録。直近1分以内に同じ送信（重複排除の鍵が同一）があれば保存せず null（成功扱い）。
 * 回数制限・容量の上限に達していれば CONTACT_ERRORS.rateLimited の例外。
 */
export async function submitContactMessage(input: ContactSubmission): Promise<ContactReceipt | null> {
  const value = validateContactMessageInput(input);
  const receivedAt = new Date();

  if (!isSupabaseConfigured()) {
    const id = addFixtureContactMessage(
      { ...value, requesterId: input.requesterId, userAgent: input.userAgent },
      receivedAt,
    );
    return id === null ? null : { id, category: value.category, receivedAt: receivedAt.toISOString() };
  }

  const salt = process.env.CONTACT_RATE_SALT?.trim();
  if (!salt) {
    // 起動時ではなく送信時に拒否する（問い合わせ以外の画面は止めない）。
    console.error("[contact] CONTACT_RATE_SALT が未設定のため、お問い合わせを受け付けられません。");
    throw new Error(SUBMIT_FAILED);
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("submit_contact_message", {
    p_category: value.category,
    p_message: value.message,
    p_reply_to: value.replyTo,
    p_spot_id: value.spotId,
    p_source_hash: hashContactSource(input.sourceIp, salt),
    p_requester_id: input.requesterId,
    p_user_agent: input.userAgent,
  });
  if (error) {
    if (error.hint === "contact_capacity") {
      // 運営が古い問い合わせを整理するまで新規を受け付けない状態。気づけるように記録する。
      console.error("[contact] 問い合わせの保存件数が上限（10,000件）に達しています。古いものを整理してください。");
    }
    // 拒否文言（CONTACT_ERRORS の各文言）は DB がそのまま返す。Server Action が表示してよいものだけを選ぶ。
    throw new Error(error.message ? error.message : SUBMIT_FAILED);
  }
  if (typeof data !== "string") return null;
  return { id: data, category: value.category, receivedAt: receivedAt.toISOString() };
}

export interface ContactPurgeResult {
  deletedMessages: number;
  deletedRates: number;
}

/**
 * 保存期間を過ぎたお問い合わせを削除する（SPEC §9.17。日次 cron の最後に呼ぶ）。
 * 問い合わせは受付から1年ちょうどで、送信元の記録（contact_rate）は24時間ちょうどで削除する。
 * Supabase 経路では DB 関数 purge_expired_contact_data（service_role 専用、DB の now() を使う）を呼ぶため、
 * 引数の now はデモモード（フィクスチャ）でだけ使う。デモには送信元の記録が無いので deletedRates は常に0。
 */
export async function purgeExpiredContactData(now: Date): Promise<ContactPurgeResult> {
  if (!isSupabaseConfigured()) {
    return { deletedMessages: purgeFixtureContactMessages(now), deletedRates: 0 };
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("purge_expired_contact_data");
  if (error) throw new Error(`お問い合わせの保存期間の処理に失敗しました: ${error.message}`);
  const value = (data ?? {}) as Partial<Record<keyof ContactPurgeResult, unknown>>;
  if (typeof value.deletedMessages !== "number" || typeof value.deletedRates !== "number") {
    throw new Error("お問い合わせの保存期間の処理の結果を読み取れませんでした");
  }
  return { deletedMessages: value.deletedMessages, deletedRates: value.deletedRates };
}
