"use server";

import { getSiteOrigin } from "@/lib/auth/site-url";
import { safeNextPath } from "@/lib/auth/safe-next";
import { isDemoMode } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export interface LoginActionState {
  sent?: boolean;
  error?: string;
}

export async function sendLoginLink(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const emailValue = formData.get("email");
  const email = typeof emailValue === "string" ? emailValue.trim() : "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "メールアドレスを入力してください" };

  // デモモードは常にデモユーザーでログイン済みの扱いで、メールは送らない。
  if (isDemoMode()) return { error: "デモでは、ログイン用のメールは送りません（保存もされません）。デモの利用者として、もうログインしています。" };

  // Spec §9.13.7: 戻り先の origin はリクエストヘッダーではなく固定の環境変数から作る。
  const origin = getSiteOrigin();
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", safeNextPath(formData.get("next"), origin));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback.toString() },
  });
  if (error) return { error: `ログイン用メールを送れませんでした: ${error.message}` };
  return { sent: true };
}
