import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return NextResponse.redirect(new URL("/login?error=invalid_link", url.origin));

  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) return NextResponse.redirect(new URL("/login?error=no_user", url.origin));

  const metadataName = data.user.user_metadata.display_name;
  const displayName =
    typeof metadataName === "string" && metadataName.trim()
      ? metadataName.trim()
      : (data.user.email?.split("@")[0] ?? "地元の人");
  const { error: profileError } = await supabase.from("users").upsert(
    { id: data.user.id, display_name: displayName },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (profileError) return NextResponse.redirect(new URL("/login?error=profile", url.origin));

  return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next"), url.origin), url.origin));
}
