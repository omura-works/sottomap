"use server";

import { revalidatePath } from "next/cache";
import { addBookmark, removeBookmark } from "@/lib/db/mutations";
import { DEMO_USER_ID } from "@/components/profile/demo-user";

/**
 * 栞の追加/削除 Server Action。書き込みは mutations.ts に集約する。
 * 認証結線前のため、今回は DEMO_USER_ID を利用する。
 */
export async function addBookmarkAction(spotId: string, plannedAt?: string | null): Promise<void> {
  await addBookmark(DEMO_USER_ID, spotId, plannedAt ?? undefined);

  revalidatePath("/bookmarks");
  revalidatePath("/[city]/spots/[id]", "page");
}

export async function removeBookmarkAction(spotId: string): Promise<void> {
  await removeBookmark(DEMO_USER_ID, spotId);

  revalidatePath("/bookmarks");
  revalidatePath("/[city]/spots/[id]", "page");
}
