import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getSpot, listBookmarks } from "@/lib/db/spots";
import { quietnessLabel } from "@/lib/domain/quietness";
import { daysSince } from "@/lib/domain/lifecycle";
import type { Quietness } from "@/lib/db/types";
import { Tag } from "@/components/ui/Tag";
import type { TagKind } from "@/components/ui/Tag";
import { getCurrentUserId } from "@/lib/auth";
import { BookmarkButton } from "./BookmarkButton";
import { PageTransition } from "@/components/motion/PageTransition";
import { PageLamp } from "@/components/motion/PageLamp";
import { Reveal } from "@/components/motion/Reveal";
import { Stamp } from "@/components/motion/Stamp";
import { NightAlley } from "@/components/illustrations/NightAlley";
import { PIN_GLYPH } from "@/components/map/pin-halo";
import { PhotoRibbon } from "./PhotoRibbon";

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
  await connection();
  const { city, id } = await params;
  const spot = await getSpot(id);

  if (!spot || spot.citySlug !== city) {
    notFound();
  }

  const userId = await getCurrentUserId();
  const bookmarks = userId ? await listBookmarks(userId) : [];
  const alreadyBookmarked = bookmarks.some((bookmark) => bookmark.spotId === spot.id);

  const kicker = [spot.cityName, spot.areaName].filter(Boolean).join("・") + (spot.category ? ` / ${spot.category}` : "");

  const statusBody = spot.lastVerifiedAt
    ? `${daysSince(spot.lastVerifiedAt, new Date())}日前、地元の${spot.verifierCount}人が『${STATUS_CONFIRM_QUOTE[spot.quietness]}』と確認。`
    : "まだ、たしかめた人はいません。";

  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;

  return (
    <PageTransition>
      <div className="spot-detail mx-auto max-w-2xl px-4 py-6 lg:py-10 space-y-6">
        {/* SPEC motion §5.4: 写真は台紙に貼った1枚（−1.5° 傾き、上の角に2枚のテープ）。写真は LCP なので透明から始めない。
            写真が無いときは夜の路地（窓の灯りが1つずつ灯る）。右上に栞のリボン。 */}
        <figure className="detail-photo">
          {spot.photoUrl ? (
            <div
              className="detail-photo-mount verb-stick keep-visible"
              style={{ "--from-y": "-10px", "--from-rot": "-3deg", "--tilt": "-1.5deg" } as CSSProperties}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 外部URLの店舗写真をそのまま表示する */}
              <img src={spot.photoUrl} alt={spot.name} className="detail-photo-img" />
              <span className="tape tape-in detail-tape-l" style={{ "--d": "360ms" } as CSSProperties} aria-hidden="true" />
              <span className="tape tape-in detail-tape-r" style={{ "--d": "420ms" } as CSSProperties} aria-hidden="true" />
            </div>
          ) : (
            <NightAlley
              ignite
              className="detail-alley verb-stick keep-visible"
              style={{ "--from-y": "-10px", "--from-rot": "-3deg" } as CSSProperties}
            >
              <span className="detail-no-photo">写真は、まだありません</span>
            </NightAlley>
          )}
          <PhotoRibbon spotId={spot.id} initiallyBookmarked={alreadyBookmarked} />
        </figure>

        <header className="detail-head">
          <p className="detail-kicker">
            <PageLamp />
            {kicker}
          </p>
          <h1 className="detail-title">{spot.name}</h1>
          {spot.tags.length > 0 ? (
            <div className="detail-tags">
              {spot.tags.map((tag, i) => (
                <Tag
                  key={tag.id}
                  kind={tag.kind}
                  className="verb-pop keep-visible"
                  style={{ "--from-y": "0px", "--from-scale": "0.9", "--d": `${200 + Math.min(i, 7) * 40}ms` } as CSSProperties}
                >
                  {tag.label}
                </Tag>
              ))}
            </div>
          ) : null}
        </header>

        <blockquote className="detail-quote">
          <span className="detail-qmark detail-qmark-open" aria-hidden="true">
            「
          </span>
          <p className="detail-quote-text">{spot.reason}</p>
          <span className="detail-qmark detail-qmark-close" aria-hidden="true">
            」
          </span>
          <p className="detail-quote-by">— {spot.authorLabel}</p>
        </blockquote>

        <div className="card detail-status">
          <Reveal as="span" verb="stamp" className="reveal-stamp">
            <Stamp glyph={PIN_GLYPH[spot.quietness]} tone={spot.quietness} size={72} tilt={-6} />
          </Reveal>
          <div className="detail-status-text">
            <Tag kind={STATUS_TAG_KIND[spot.quietness]}>{quietnessLabel(spot.quietness)}</Tag>
            <h3 className="status-title">{STATUS_TITLE[spot.quietness]}</h3>
            <p className="detail-status-body">{statusBody}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <BookmarkButton spotId={spot.id} initiallyBookmarked={alreadyBookmarked} />
          <Link href={directionsHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            道順
            <span className="btn-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>

        {/* 指示書 pages-c-brief.md §3: 店主向けの導線。目立たせすぎない小さなリンク。 */}
        <p className="m-0 text-muted text-xs">
          <Link href={`/contact?spot=${spot.id}`}>
            この店の情報について
          </Link>
        </p>
      </div>
    </PageTransition>
  );
}
