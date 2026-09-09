import { listBookmarks } from "@/lib/db/spots";
import { DEMO_USER_ID } from "@/components/profile/demo-user";
import { Disclaimer } from "@/components/profile/Disclaimer";
import { BookmarkList } from "./BookmarkList";
import type { BookmarkListItem } from "./BookmarkList";

/** S8「栞」`/bookmarks`。 */
export default async function BookmarksPage() {
  const bookmarks = await listBookmarks(DEMO_USER_ID);

  const items: BookmarkListItem[] = bookmarks.map((bookmark) => ({
    id: bookmark.id,
    spotId: bookmark.spotId,
    citySlug: bookmark.spot.citySlug,
    cityName: bookmark.spot.cityName,
    areaName: bookmark.spot.areaName,
    spotName: bookmark.spot.name,
    photoUrl: bookmark.spot.photoUrl,
    plannedAt: bookmark.plannedAt,
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 lg:py-10 space-y-6">
      <header className="space-y-2">
        <p className="text-muted text-xs tracking-wide uppercase">栞</p>
        <h1>挟んだ店</h1>
        <p className="text-muted">{items.length}軒。旅のあいだ、地図の上でも光ります。</p>
      </header>

      <BookmarkList initialItems={items} />

      <Disclaimer />
    </div>
  );
}
