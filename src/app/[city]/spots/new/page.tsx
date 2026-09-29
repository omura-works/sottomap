import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { getCity, listPendingSpots } from "@/lib/db/spots";
import { NewSpotForm } from "@/components/spot-form/NewSpotForm";
import { PendingSpotList } from "@/components/spot-form/PendingSpotList";
import { PageTransition } from "@/components/motion/PageTransition";

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
      <div className="mx-auto max-w-xl px-4 py-8 lg:py-12 space-y-10">
        {created ? (
          <p className="rounded-full bg-[var(--color-accent-100)] px-4 py-2 text-sm">
            ピンを立てました。同じ街の2人が「行ったことがある」と答えると地図に出ます。
          </p>
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
