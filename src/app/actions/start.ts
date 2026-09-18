"use server";

import { getCurrentUserId } from "@/lib/auth";
import { setUserHomeCity } from "@/lib/db/mutations";
import { getCity, getUserProfile } from "@/lib/db/spots";

/**
 * トップ（/start）の「歩きはじめる」。選んだのは「見に行く街」であり、住んでいる街は変えない（SPEC §9.16）。
 * ログイン中で、住んでいる街がまだ無い（NULL）利用者に限り、初回だけその街を住んでいる街にする。
 * 住んでいる街の変更は /me の明示的な操作（changeHomeCityAction）だけで行う。
 */
export async function saveHomeCityAction(citySlug: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const city = await getCity(citySlug);
  if (!city) throw new Error("街の情報が取得できませんでした");

  const profile = await getUserProfile(userId);
  // プロフィール行が無い・既に住んでいる街がある利用者は何もしない。
  if (!profile || profile.homeCityId !== null) return;
  await setUserHomeCity(userId, city.id);
}
