"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEMO_USER_ID } from "@/components/profile/demo-user";

/**
 * 栞の追加/削除 Server Action（T5 所有）。
 *
 * 認証結線（Task 6）前のため、`DEMO_USER_ID`（`supabase/seed.sql` の「Kさん」実UUID）
 * を書き込みユーザーとして使う。`createClient` は Task 2 が `src/lib/supabase/server`
 * に用意する予定のサーバー用 Supabase クライアント（PLAN.md Task2）を想定している。
 * まだ存在しない場合は型エラーになるため、報告に記載する。
 *
 * `bookmarks` テーブルは `unique (user_id, spot_id)` を持つ（0001_init.sql）ため、
 * 重複挿入は `onConflict` で無視する。
 */
export async function addBookmarkAction(spotId: string, plannedAt?: string | null): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("bookmarks").upsert(
    {
      user_id: DEMO_USER_ID,
      spot_id: spotId,
      planned_at: plannedAt ?? null,
    },
    { onConflict: "user_id,spot_id", ignoreDuplicates: true },
  );

  if (error) {
    throw new Error(`栞への追加に失敗しました: ${error.message}`);
  }

  revalidatePath("/bookmarks");
  revalidatePath("/[city]/spots/[id]", "page");
}

export async function removeBookmarkAction(bookmarkId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("id", bookmarkId)
    .eq("user_id", DEMO_USER_ID);

  if (error) {
    throw new Error(`栞の削除に失敗しました: ${error.message}`);
  }

  revalidatePath("/bookmarks");
  revalidatePath("/[city]/spots/[id]", "page");
}
