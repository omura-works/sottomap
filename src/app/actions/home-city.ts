"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { setUserHomeCity } from "@/lib/db/mutations";
import { getCity } from "@/lib/db/spots";
import { HOME_CITY_LIMIT_PREFIX } from "@/lib/domain/home-city";

export type ChangeHomeCityResult =
  | { ok: true; cityName: string; changedAt: string | null }
  | { ok: false; message: string };

const GENERIC_ERROR = "住んでいる街を変えられませんでした。もう一度お試しください。";

/** 利用者にそのまま見せてよい、DB 関数・フィクスチャの拒否理由（SPEC §9.16）。 */
function isUserFacingMessage(message: string): boolean {
  return (
    message.startsWith(HOME_CITY_LIMIT_PREFIX) ||
    message === "街の情報が取得できませんでした" ||
    message === "ログインが必要です"
  );
}

/**
 * /me「住んでいる街」の変更（SPEC §9.16）。住んでいる街を変えられる唯一の明示的な操作。
 * 90日に1回までの制限は DB 関数 set_home_city（デモモードはフィクスチャ）が強制する。
 * 失敗は例外にせず状態として返す（SPEC §9.14-7。画面は role="alert" で知らせる）。
 */
export async function changeHomeCityAction(citySlug: string): Promise<ChangeHomeCityResult> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, message: "ログインが必要です" };

  try {
    const city = await getCity(citySlug);
    if (!city) return { ok: false, message: "街の情報が取得できませんでした" };
    const changedAt = await setUserHomeCity(userId, city.id);
    // ナビの「地図」「さがす」（居住街を指す。§9.14-3）も含めて描き直す。
    revalidatePath("/", "layout");
    return { ok: true, cityName: city.name, changedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { ok: false, message: isUserFacingMessage(message) ? message : GENERIC_ERROR };
  }
}
