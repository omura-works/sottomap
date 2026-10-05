import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { getCity, listPendingSpots } from "@/lib/db/spots";
import { NewSpotForm } from "@/components/spot-form/NewSpotForm";
import { PendingSpotList } from "@/components/spot-form/PendingSpotList";
import type { CSSProperties } from "react";
import { PageTransition } from "@/components/motion/PageTransition";
import { LanternChild } from "@/components/illustrations/LanternChild";

interface NewSpotPageProps {
  params: Promise<{ city: string }>;
  searchParams: Promise<{ created?: string }>;
}

/** S5「ピンを立てる」 `/[city]/spots/new`（SPEC §4 S5）。 */
export default async function NewSpotPage({ params, searchParams }: NewSpotPageProps) {
  await connection();
  const { city: citySlug } = await params;
  const { created } = await searchParams;
  const userId = await getCurrentUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/${citySlug}/spots/new`)}`);

  const city = await getCity(citySlug);
  if (!city) notFound();

  const pendingSpots = await listPendingSpots(citySlug, userId);

  return (
    <PageTransition>
      <div className="new-spot-screen mx-auto max-w-xl px-4 py-8 lg:py-12">
        {created ? (
          // SPEC motion §5.8-1: 苔色の付箋が貼られ、灯りの子が跳ねる
          <div className="sticky new-spot-created verb-stick keep-visible" data-tone="moss" style={{ "--tilt": "-1deg" } as CSSProperties}>
            <LanternChild size={36} className="new-spot-created-child verb-pop" style={{ "--d": "200ms" } as CSSProperties} />
            <p className="new-spot-created-text">ピンを立てました！同じ街の2人が「行ったことがある」と答えると、地図に出ます。</p>
          </div>
        ) : null}

        <NewSpotForm city={city} />

        {/* SPEC §9.12-6: S2 地図画面と /me からもここへ直接リンクできるようアンカーを用意する。 */}
        <div id="pending-spots" style={{ scrollMarginTop: "1rem" }}>
          <PendingSpotList spots={pendingSpots} citySlug={citySlug} viewerId={userId} />
        </div>
      </div>
    </PageTransition>
  );
}
