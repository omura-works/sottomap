import { NextResponse } from "next/server";
import { getSiteOrigin } from "@/lib/auth/site-url";
import { safeNextPath } from "@/lib/auth/safe-next";
import { isDemoMode } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  // デモモードではメールログインを使わない（常にデモユーザー）。
  if (isDemoMode()) {
    return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next"), url.origin), url.origin));
  }

  // Spec §9.13.7: リダイレクト先の origin もリクエストの Host ではなく固定の環境変数から作る。
  const origin = getSiteOrigin();
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=missing_code", origin));

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return NextResponse.redirect(new URL("/login?error=invalid_link", origin));

  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) return NextResponse.redirect(new URL("/login?error=no_user", origin));

  // SPEC §9.18-1: 表示名にメールアドレスの一部（や本人が送れる user_metadata）を使わない。
  // プロフィール行は DB 関数 ensure_user_profile が作る（初期値「地元の人」。既にあれば何もしない）。
  // 利用者は users へ直接 insert できない（列権限を外してある）。
  const { error: profileError } = await supabase.rpc("ensure_user_profile");
  if (profileError) return NextResponse.redirect(new URL("/login?error=profile", origin));

  return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next"), origin), origin));
}
