"use server";

import { headers } from "next/headers";
import { safeNextPath } from "@/lib/auth/safe-next";
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

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
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
