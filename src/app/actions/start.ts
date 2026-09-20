"use server";

import { getCurrentUserId } from "@/lib/auth";
import { initializeUserHomeCity } from "@/lib/db/mutations";
import { getCity } from "@/lib/db/spots";

/** initialize_home_city / initializeFixtureUserHomeCity がプロフィール行が無いときに投げる例外のメッセージ（0007）。 */
const PROFILE_NOT_FOUND_MESSAGE = "プロフィールが見つかりません";

/**
 * トップ（/start）の「歩きはじめる」。選んだのは「見に行く街」であり、住んでいる街は変えない（SPEC §9.16）。
 * ログイン中で、住んでいる街がまだ無い（NULL）利用者に限り、初回だけその街を住んでいる街にする。
 * 「未設定か」はここで読んで判断せず、初回設定専用の DB 関数 initialize_home_city（行ロックの中で判断し、
 * 設定済みなら何もしない）に任せる。先に読むと、2タブが同時に NULL を読んだとき後続が「変更」になってしまう。
 * 住んでいる街の変更は /me の明示的な操作（changeHomeCityAction）だけで行う。
 *
 * プロフィール行が無い（本来ありえないデータ不整合）場合は initializeUserHomeCity が例外を投げる
 * （R14 軽微1: 「既に設定済み」と区別するため）。ここで捕まえて記録し、「歩きはじめる」操作自体は
 * 妨げない（画面は止めない）。それ以外の例外（存在しない街など）はそのまま呼び出し元に伝える。
 */
export async function saveHomeCityAction(citySlug: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const city = await getCity(citySlug);
  if (!city) throw new Error("街の情報が取得できませんでした");

  try {
    await initializeUserHomeCity(userId, city.id);
  } catch (error) {
    if (error instanceof Error && error.message === PROFILE_NOT_FOUND_MESSAGE) {
      console.error("[saveHomeCityAction] プロフィールが見つかりません", { userId });
      return;
    }
    throw error;
  }
}
