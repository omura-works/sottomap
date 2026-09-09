import { notFound } from "next/navigation";
import { getCity, listPendingSpots } from "@/lib/db/spots";
import { NewSpotForm } from "@/components/spot-form/NewSpotForm";
import { PendingSpotList } from "@/components/spot-form/PendingSpotList";
import { DEMO_USER_ID } from "@/components/profile/demo-user";

interface NewSpotPageProps {
  params: Promise<{ city: string }>;
  searchParams: Promise<{ created?: string }>;
}

/** S5「ピンを立てる」 `/[city]/spots/new`（SPEC §4 S5）。 */
export default async function NewSpotPage({ params, searchParams }: NewSpotPageProps) {
  const { city: citySlug } = await params;
  const { created } = await searchParams;

  const city = await getCity(citySlug);
  if (!city) notFound();

  const pendingSpots = await listPendingSpots(citySlug, DEMO_USER_ID);

  return (
    <div className="mx-auto max-w-xl px-4 py-8 lg:py-12 space-y-10">
      {created ? (
        <p className="rounded-full bg-[var(--color-accent-100)] px-4 py-2 text-sm">
          ピンを立てました。同じ街の2人が「行ったことがある」と答えると地図に出ます。
        </p>
      ) : null}

      <NewSpotForm city={city} />

      <PendingSpotList spots={pendingSpots} citySlug={citySlug} viewerId={DEMO_USER_ID} />
    </div>
  );
}
