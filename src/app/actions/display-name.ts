"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { setUserDisplayName } from "@/lib/db/mutations";
import { isDisplayNameMessage } from "@/lib/domain/display-name";

export type ChangeDisplayNameResult = { ok: true; displayName: string } | { ok: false; message: string };

const GENERIC_ERROR = "表示名を変えられませんでした。もう一度お試しください。";

/**
 * /me「表示名」の変更（SPEC §9.18-1）。表示名を変えられる唯一の操作。
 * 規則は DB 関数 set_display_name（デモモードはフィクスチャ）が強制し、通信の前に同じ規則で弾く。
 * R23 重要1（0016）: set_display_name は service_role 専用。本人の ID はここでサーバー側で確かめた
 * getCurrentUserId（auth.getUser）だけを使い、画面から送られた値は使わない。
 * 失敗は例外にせず状態として返す（画面は role="alert" で知らせる）。
 */
export async function changeDisplayNameAction(name: string): Promise<ChangeDisplayNameResult> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, message: "ログインが必要です" };

  try {
    const displayName = await setUserDisplayName(userId, name);
    // 店の詳細の署名（public_profiles）にも出るので、全体を描き直す。
    revalidatePath("/", "layout");
    return { ok: true, displayName };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const userFacing = isDisplayNameMessage(message) || message === "ログインが必要です";
    return { ok: false, message: userFacing ? message : GENERIC_ERROR };
  }
}
