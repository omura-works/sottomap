import { listBookmarks } from "@/lib/db/spots";
import { getCurrentUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
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
    <div className="mx-auto max-w-2xl px-4 py-6 lg:py-10">
      <BookmarkList
        initialItems={items}
        header={
          // 2026-09-26 案B: 見出しと「地図にまとめる」を夜のカード（BookmarkList 側）の中に置く。
          <header className="flex flex-col gap-2.5">
            <p style={{ margin: 0, fontSize: 12, fontWeight: 500, letterSpacing: "0.3em", color: "var(--color-accent-400)" }}>栞</p>
            {/* Codex R8 重要3: 栞を外した行の前後どちらも無いときのフォーカス先（BookmarkList側から参照）。 */}
            <h1
              id="bookmarks-heading"
              tabIndex={-1}
              style={{ margin: 0, fontSize: "clamp(30px, 4vw, 40px)", color: "var(--color-bg)" }}
            >
              挟んだ店
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: "var(--color-neutral-400)" }}>
              {items.length}軒。旅のあいだ、地図の上でも光ります。
            </p>
          </header>
        }
      />
    </div>
  );
}
