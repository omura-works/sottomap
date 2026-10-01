import { listBookmarks } from "@/lib/db/spots";
import { getCurrentUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BookmarkList } from "./BookmarkList";
import type { BookmarkListItem } from "./BookmarkList";
import { formatPlannedAtInTokyo } from "@/lib/format/date-time";
import { PageTransition } from "@/components/motion/PageTransition";
import { PageLamp } from "@/components/motion/PageLamp";
import { BounceNumber } from "@/components/motion/BounceNumber";
import type { CSSProperties } from "react";

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
    <PageTransition>
      <div className="mx-auto max-w-2xl px-4 py-6 lg:py-10">
        <BookmarkList
          initialItems={items}
          header={
            // 2026-09-26 案B: 見出しと「地図にまとめる」を夜のカード（BookmarkList 側）の中に置く。
            <header className="bm-head">
              <p className="bm-kicker">
                <PageLamp tone="night" />栞
              </p>
              {/* Codex R8 重要3: 栞を外した行の前後どちらも無いときのフォーカス先（BookmarkList側から参照）。 */}
              <h1 id="bookmarks-heading" tabIndex={-1} className="bm-title">
                挟んだ店
              </h1>
              {/* SPEC motion §5.5: 件数の数字がこの画面の山。外して描き直されたら桁が回って跳ねる */}
              {items.length > 0 ? (
                <p className="bm-count">
                  <span className="bm-count-num verb-pop" style={{ "--d": "200ms" } as CSSProperties}>
                    <BounceNumber value={items.length} />
                  </span>
                  <span className="bm-count-text">軒。旅のあいだ、地図の上でも光ります。</span>
                </p>
              ) : null}
            </header>
          }
        />
      </div>
    </PageTransition>
  );
}
