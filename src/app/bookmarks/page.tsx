import { listBookmarks } from "@/lib/db/spots";
import { getCurrentUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Disclaimer } from "@/components/profile/Disclaimer";
import { BookmarkList } from "./BookmarkList";
import type { BookmarkListItem } from "./BookmarkList";
import { formatPlannedAtInTokyo } from "@/lib/format/date-time";

/** S8「栞」`/bookmarks`。 */
export default async function BookmarksPage() {
  await connection();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login?next=%2Fbookmarks");
  const bookmarks = await listBookmarks(userId);

  const items: BookmarkListItem[] = bookmarks.map((bookmark) => {
    const location = [bookmark.spot.cityName, bookmark.spot.areaName].filter(Boolean).join("・");
    const plannedLabel = formatPlannedAtInTokyo(bookmark.plannedAt);
    return {
      id: bookmark.id,
      spotId: bookmark.spotId,
      citySlug: bookmark.spot.citySlug,
      cityName: bookmark.spot.cityName,
      areaName: bookmark.spot.areaName,
      spotName: bookmark.spot.name,
      photoUrl: bookmark.spot.photoUrl,
      plannedAt: bookmark.plannedAt,
      meta: bookmark.meta ?? [location, plannedLabel].filter(Boolean).join(" / "),
    };
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 lg:py-10 space-y-6">
      <header className="space-y-2">
        <p className="text-muted text-xs tracking-wide uppercase">栞</p>
        <h1 style={{ fontSize: 30 }}>挟んだ店</h1>
        <p className="text-muted">{items.length}軒。旅のあいだ、地図の上でも光ります。</p>
      </header>

      <BookmarkList initialItems={items} />

      <Disclaimer />
    </div>
  );
}
