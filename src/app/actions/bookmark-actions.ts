"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { addBookmark, removeBookmark } from "@/lib/db/mutations";

/**
 * 栞の追加/削除 Server Action。書き込みは mutations.ts に集約する。
 */
export async function addBookmarkAction(spotId: string, plannedAt?: string | null): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login?next=%2Fbookmarks");
  await addBookmark(userId, spotId, plannedAt ?? undefined);

  revalidatePath("/bookmarks");
  revalidatePath("/[city]/spots/[id]", "page");
}

export async function removeBookmarkAction(spotId: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login?next=%2Fbookmarks");
  await removeBookmark(userId, spotId);

  revalidatePath("/bookmarks");
  revalidatePath("/[city]/spots/[id]", "page");
}
