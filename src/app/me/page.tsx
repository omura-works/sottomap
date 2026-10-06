import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { getProfileStats, getUserProfile, listCities, listSpotsByAuthor } from "@/lib/db/spots";
import { resolveBadges } from "@/lib/domain/lantern";
import { quietnessLabel } from "@/lib/domain/quietness";
import type { Quietness, SpotStatus } from "@/lib/db/types";
import type { CSSProperties } from "react";
import { Divider } from "@/components/ui/Divider";
import { Tag } from "@/components/ui/Tag";
import { HomeCitySetting } from "@/components/profile/HomeCitySetting";
import { DisplayNameSetting } from "./DisplayNameSetting";
import { LanternBadge } from "./LanternBadge";
import { Stat } from "./MeStat";
import { canChangeHomeCity, formatHomeCityChangeDate, nextHomeCityChangeAt } from "@/lib/domain/home-city";
import { PageTransition } from "@/components/motion/PageTransition";
import { PageLamp } from "@/components/motion/PageLamp";
import { Reveal } from "@/components/motion/Reveal";
import { Stamp } from "@/components/motion/Stamp";
import { tiltFromId } from "@/components/motion/tilt";
import { LanternChild } from "@/components/illustrations/LanternChild";
import { Lantern } from "@/components/illustrations/Lantern";
import { PIN_GLYPH } from "@/components/map/pin-halo";

/**
 * SPEC §9.8: S7「あなたが書いた店」のステータス表記は `quietnessLabel()` の
 * 「静かなまま」とは別の画面固有コピー「静か」を使う。quiet 以外は原本に
 * 指定が無いため、通常の `quietnessLabel()` にフォールバックする。
 */
function authoredSpotQuietnessLabel(quietness: Quietness): string {
  return quietness === "quiet" ? "静か" : quietnessLabel(quietness);
}

/**
 * SPEC §9.14-6: 投稿一覧はライフサイクル状態（承認待ち／公開中／確認切れ／期限切れ）を
 * 主表示にする。静けさのラベルは公開中の店にだけ併記する。
 */
const LIFECYCLE_LABEL: Record<SpotStatus, string> = {
  pending: "承認待ち",
  published: "公開中",
  dormant: "確認切れ",
  expired: "期限切れ",
};

/**
 * S7「プロフィール」`/me`。認証ユーザーのプロフィール・集計・投稿を表示する。
 */
export default async function ProfilePage() {
  await connection();
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login?next=%2Fme");
  const [profile, stats, authoredSpots, cities] = await Promise.all([
    getUserProfile(userId),
    getProfileStats(userId),
    listSpotsByAuthor(userId),
    listCities(),
  ]);
  const homeCity = cities.find((city) => city.id === profile?.homeCityId) ?? null;
  const displayName = profile?.displayName ?? "地元の人";
  // SPEC §9.16: 90日の制限中なら、次に変えられる日を添える。
  const homeCityChangedAt = profile?.homeCityChangedAt ?? null;
  const nextHomeCityChange = nextHomeCityChangeAt(homeCityChangedAt);
  const nextChangeNote =
    nextHomeCityChange && !canChangeHomeCity(homeCityChangedAt)
      ? `次に変えられるのは${formatHomeCityChangeDate(nextHomeCityChange)}以降です。`
      : null;

  const badges = resolveBadges({
    verificationCount: stats.verificationsAnswered,
    winterVerificationCount: stats.winterVerificationCount,
    publishedPortSpotCount: stats.publishedPortSpotCount,
    publishedSpotCount: authoredSpots.filter((spot) => spot.status === "published").length,
  });

  const pendingCount = stats.pendingRequestCount;
  const citySlug = homeCity?.slug ?? "sapporo";

  return (
    <PageTransition>
      <div className="me-screen mx-auto max-w-2xl px-4 py-6 lg:py-10">
        <header className="me-head">
          <Avatar avatarUrl={profile?.avatarUrl ?? null} displayName={displayName} />
          <div className="min-w-0">
            <h1 className="me-name">
              <PageLamp />
              {displayName}
            </h1>
            <p className="me-home">{homeCity ? `${homeCity.name}に住んでいます` : "住んでいる街は、まだ決めていません"}</p>
          </div>
        </header>

        {/* SPEC motion §5.6: 3つの数字がこの画面の山。付箋が貼られ、数字が跳ねる（0 から数え上げない） */}
        <section className="me-stats">
          <Stat index={0} tone="orange" tilt={-1.5} value={stats.spotsCreated} unit="本" label="立てたピン" />
          <Stat index={1} tone="moss" tilt={1} value={stats.verificationsAnswered} unit="回" label="たしかめた回数" />
          <Stat index={2} tone="night" tilt={-1} value={stats.spotsKeptQuiet} unit="軒" label="静けさを守った店" />
        </section>

        <section className="me-section" aria-labelledby="me-lantern-heading">
          <h2 id="me-lantern-heading">灯り</h2>
          <p className="me-lead">たしかめたり、ピンを立てたりするたびに、灯りが少しずつたまっていきます。</p>
          {/* 2026-09-26 案B: 暗い角丸カードのバッジ（モバイルは2列、広い画面は幅200で横に並べる） */}
          <ul className="me-badges grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4">
            {badges.map((badge, i) => (
              // 最初の画面に入っていても、数字の付箋の後（600ms 後）に棒が満ちる動きを一度だけ再生する
              <Reveal key={badge.id} as="li" verb="stick" index={i} inView="parts" inViewDelay={600} className="sm:w-[200px]">
                <LanternBadge badge={badge} />
              </Reveal>
            ))}
          </ul>
        </section>

        <section className="me-section" aria-labelledby="me-spots-heading">
          <h2 id="me-spots-heading">あなたが書いた店</h2>
          {authoredSpots.length === 0 ? (
            <div className="empty-state">
              <LanternChild size={48} />
              <p className="empty-state-big">まだ、あなたが立てたピンはありません</p>
              <p className="empty-state-small">通っている店があったら、最初の一軒をどうぞ。</p>
              <Link href={`/${citySlug}/spots/new`} transitionTypes={["page-forward"]} className="btn btn-secondary">
                ピンを立てる
              </Link>
            </div>
          ) : (
            <ul className="me-rows">
              {authoredSpots.map((spot, i) => (
                <Reveal key={spot.id} as="li" verb="stick" index={i} className="me-row">
                  {spot.status === "published" ? (
                    <Stamp glyph={PIN_GLYPH[spot.quietness]} tone={spot.quietness} size={26} tilt={tiltFromId(spot.id, 4)} />
                  ) : (
                    <span className="me-row-stamp-space" aria-hidden="true" />
                  )}
                  <span className="me-row-name">{spot.name}</span>
                  <span className="me-row-tags">
                    <Tag kind="accent2">{LIFECYCLE_LABEL[spot.status]}</Tag>
                    {spot.status === "published" ? <Tag kind="neutral">{authoredSpotQuietnessLabel(spot.quietness)}</Tag> : null}
                  </span>
                </Reveal>
              ))}
            </ul>
          )}
          {/* SPEC §9.12-6: 承認待ち一覧（S2地図の下部にも同じ導線を追加済み）への導線を /me からも開けるようにする。 */}
          <p className="me-pending-link">
            <Link href={`/${citySlug}/spots/new#pending-spots`} transitionTypes={["page-forward"]}>
              承認待ちのピンをのぞく<span aria-hidden="true">{" →"}</span>
            </Link>
          </p>
        </section>

        {/* SPEC §9.13.3: pendingRequestCount は回答できる依頼（期限到来済みの open ＋ dormant 復帰の対象になる
            最新の missed）だけの件数。期限前の依頼は「確認待ち」に数えない（getProfileStats が数える）。 */}
        <Reveal verb="stick" className="me-wait-wrap" style={{ "--tilt": "0deg" } as CSSProperties}>
          <div className="sticky me-wait" data-tone="orange" data-waiting={pendingCount > 0 ? "true" : "false"} style={{ "--tilt": "-1deg" } as CSSProperties}>
            <Lantern size={36} lit={pendingCount > 0} tone="paper" className="me-wait-lantern" />
            <div>
              <h3 className="me-wait-title">
                確認待ちが<span className="me-wait-num">{pendingCount}</span>件あります
              </h3>
              <p className="me-wait-body">返事がないままだと、そのピンは90日後に地図からそっと外れます。</p>
            </div>
          </div>
        </Reveal>

        {/* 表示名・住んでいる街の設定は、飾らない紙のカード（大事な設定なので落ち着いて読めるように）。中身は変えない */}
        <div className="card me-settings">
          {/* SPEC §9.18-1: 表示名の変更（初期値は「地元の人」。メールアドレスの一部は使わない）。 */}
          <DisplayNameSetting currentName={displayName} />
          <Divider />
          <HomeCitySetting
            cities={cities.map((city) => ({ slug: city.slug, name: city.name }))}
            currentCitySlug={homeCity?.slug ?? null}
            nextChangeNote={nextChangeNote}
          />
        </div>
      </div>
    </PageTransition>
  );
}

/** アバター（72px）。画像が無いときは判子の形（頭文字）で押される。読み上げは今のまま（画像は alt、判子は aria-hidden）。 */
function Avatar({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- 外部URLのアバター画像をそのまま表示する
    return <img src={avatarUrl} alt={displayName} className="me-avatar-img verb-stamp keep-visible" />;
  }
  return (
    <span className="me-avatar verb-stamp keep-visible" aria-hidden="true">
      {displayName.slice(0, 1)}
    </span>
  );
}
