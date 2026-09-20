// お問い合わせの保存（docs/SPEC.md §9.17）。
//
// 保存先は public.contact_messages（0009_contact_messages.sql）。利用者には読ませないため、
// 書き込みは security definer の RPC `submit_contact_message` だけを本人（または匿名）の接続で呼ぶ。
// デモモード（URASUPO_DEMO_MODE=1。SPEC §9.13.1）は DB を持たないので、同じ規則をフィクスチャ
// （インメモリ配列。プロセスが終われば消える）で再現するだけで、どこにも保存しない。
// 入力検査と文言は @/app/contact/schema（画面と共有する）にある。

import { isSupabaseConfigured } from "../supabase/env";
import { createClient } from "../supabase/server";
import { validateContactMessageInput } from "@/app/contact/schema";
import { addFixtureContactMessage } from "./fixtures";

/**
 * お問い合わせを1件受け付ける（SPEC §9.17）。
 * 戻り値は保存した id。直近1分以内に同じ内容（用件と本文が同一）があれば保存せず null（成功扱い）。
 */
export async function submitContactMessage(input: {
  category: string | null;
  message: string;
  replyTo: string | null;
  spotId: string | null;
}): Promise<string | null> {
  const value = validateContactMessageInput(input);

  if (!isSupabaseConfigured()) {
    return addFixtureContactMessage(value, new Date());
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_contact_message", {
    p_category: value.category,
    p_message: value.message,
    p_reply_to: value.replyTo,
    p_spot_id: value.spotId,
  });
  if (error) {
    throw new Error(error.message ? error.message : "お問い合わせの送信に失敗しました");
  }
  return typeof data === "string" ? data : null;
}
