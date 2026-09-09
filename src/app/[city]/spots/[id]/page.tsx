import Link from "next/link";
import { notFound } from "next/navigation";
import { getSpot, listBookmarks } from "@/lib/db/spots";
import { quietnessLabel } from "@/lib/domain/quietness";
import { daysSince } from "@/lib/domain/lifecycle";
import type { Quietness } from "@/lib/db/types";
import { Card, Tag } from "@/components/ui";
import type { TagKind } from "@/components/ui";
import { Disclaimer } from "@/components/profile/Disclaimer";
import { DEMO_USER_ID } from "@/components/profile/demo-user";
import { BookmarkButton } from "./BookmarkButton";

/**
 * S4「まだ静かです」系の見出し・確認文言。
 * Spec §4 S4 が一字一句で指定しているのは `quiet` の場合の例文
 * （「まだ静かです」「…地元の3人が『変わっていない』と確認。」）のみ。
 * `crowding` / `touristy` はその文体を踏襲した拡張。
 */
const STATUS_TITLE: Record<Quietness, string> = {
  quiet: "まだ静かです",
  crowding: "並びはじめました",
  touristy: "もう観光地です",
};

const STATUS_CONFIRM_QUOTE: Record<Quietness, string> = {
  quiet: "変わっていない",
  crowding: "並びはじめた",
  touristy: "観光地になった",
};

const STATUS_TAG_KIND: Record<Quietness, TagKind> = {
  quiet: "accent2",
  crowding: "accent",
  touristy: "neutral",
};

export default async function SpotDetailPage({
  params,
}: {
  params: Promise<{ city: string; id: string }>;
}) {
  const { city, id } = await params;
  const spot = await getSpot(id);

  if (!spot || spot.citySlug !== city) {
    notFound();
  }

  const bookmarks = await listBookmarks(DEMO_USER_ID);
  const alreadyBookmarked = bookmarks.some((bookmark) => bookmark.spotId === spot.id);

  const kicker = [spot.cityName, spot.areaName].filter(Boolean).join("・") + (spot.category ? ` / ${spot.category}` : "");

  const statusBody = spot.lastVerifiedAt
    ? `${daysSince(spot.lastVerifiedAt, new Date())}日前、地元の${spot.verifierCount}人が『${STATUS_CONFIRM_QUOTE[spot.quietness]}』と確認。`
    : "まだ確認はありません。";

  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 lg:py-10 space-y-6">
      {spot.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- 外部URLの店舗写真をそのまま表示する
        <img
          src={spot.photoUrl}
          alt={spot.name}
          className="w-full aspect-[4/3] object-cover"
          style={{ borderRadius: "var(--radius-md)" }}
        />
      ) : (
        <div
          className="w-full aspect-[4/3] flex items-center justify-center text-muted text-sm"
          style={{ borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}
        >
          店の写真をドロップ
        </div>
      )}

      <header className="space-y-2">
        <p className="text-muted text-xs tracking-wide uppercase">{kicker}</p>
        <h2>{spot.name}</h2>
        <div className="flex flex-wrap gap-2">
          {spot.tags.map((tag) => (
            <Tag key={tag.id} kind={tag.kind}>
              {tag.label}
            </Tag>
          ))}
        </div>
      </header>

      <blockquote
        className="space-y-2 px-4 py-3"
        style={{ borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}
      >
        <p className="m-0">「{spot.reason}」</p>
        <p className="m-0 text-muted text-sm">— {spot.authorLabel}</p>
      </blockquote>

      <Card elevation="sm">
        <Tag kind={STATUS_TAG_KIND[spot.quietness]}>{quietnessLabel(spot.quietness)}</Tag>
        <h3>{STATUS_TITLE[spot.quietness]}</h3>
        <p className="m-0">{statusBody}</p>
      </Card>

      <div className="flex flex-wrap items-start gap-3">
        <BookmarkButton spotId={spot.id} initiallyBookmarked={alreadyBookmarked} />
        <Link href={directionsHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
          道順
        </Link>
      </div>

      <Disclaimer />
    </div>
  );
}
