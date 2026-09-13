"use server";

import { getCurrentUserId } from "@/lib/auth";
import { setUserHomeCity } from "@/lib/db/mutations";
import { getCity } from "@/lib/db/spots";

/** ログイン中だけ、選択した街をプロフィールへ保存する。 */
export async function saveHomeCityAction(citySlug: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const city = await getCity(citySlug);
  if (!city) throw new Error("街の情報が取得できませんでした");
  await setUserHomeCity(userId, city.id);
}
