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

  const metadataName = data.user.user_metadata.display_name;
  const displayName =
    typeof metadataName === "string" && metadataName.trim()
      ? metadataName.trim()
      : (data.user.email?.split("@")[0] ?? "地元の人");
  // users への insert は列単位の権限（id・表示名など）の範囲だけ。lantern_points は DB の既定値（0）。
  const { error: profileError } = await supabase.from("users").upsert(
    { id: data.user.id, display_name: displayName },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (profileError) return NextResponse.redirect(new URL("/login?error=profile", origin));

  return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next"), origin), origin));
}
