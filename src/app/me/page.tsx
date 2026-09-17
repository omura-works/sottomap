import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { getProfileStats, getUserProfile, listCities, listSpotsByAuthor } from "@/lib/db/spots";
import { resolveBadges } from "@/lib/domain/lantern";
import { quietnessLabel } from "@/lib/domain/quietness";
import type { Quietness, SpotStatus } from "@/lib/db/types";
import { AnimatedCounter, Card, Divider, Tag } from "@/components/ui";
import { Disclaimer } from "@/components/profile/Disclaimer";

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

  const badges = resolveBadges({
    verificationCount: stats.verificationsAnswered,
    winterVerificationCount: stats.winterVerificationCount,
    publishedPortSpotCount: stats.publishedPortSpotCount,
    publishedSpotCount: authoredSpots.filter((spot) => spot.status === "published").length,
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 lg:py-10 space-y-8">
      <header className="flex items-center gap-4">
        <Avatar avatarUrl={profile?.avatarUrl ?? null} displayName={displayName} />
        <div>
          <h1 className="m-0" style={{ fontSize: 30 }}>
            {displayName}
          </h1>
          <p className="text-muted m-0">
            {[homeCity?.name, profile?.areaName].filter(Boolean).join("・")}
            {profile?.residentYears !== null && profile?.residentYears !== undefined
              ? `に${profile.residentYears}年`
              : ""}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-3 text-center">
        <Stat label="立てたピン" value={stats.spotsCreated} />
        <Stat label="確認した回数" value={stats.verificationsAnswered} />
        <Stat label="静けさを守った店" value={stats.spotsKeptQuiet} />
      </section>

      <Divider />

      <section className="space-y-3">
        <h3>灯り</h3>
        <div className="flex flex-wrap gap-3">
          {badges.map((badge) => (
            <div
              key={badge.id}
              className="flex flex-col items-center gap-1 px-4 py-3"
              style={{
                borderRadius: "var(--radius-md)",
                background: "var(--color-surface)",
                opacity: badge.earned ? 1 : 0.45,
              }}
            >
              <span className="text-2xl" aria-hidden>
                {badge.glyph}
              </span>
              <span className="text-sm">{badge.label}</span>
              <span className="text-muted text-xs">{badge.earned ? "獲得済み" : `あと${badge.remaining}件`}</span>
            </div>
          ))}
        </div>
      </section>

      <Divider />

      <section className="space-y-3">
        <h3>あなたが書いた店</h3>
        {authoredSpots.length === 0 ? (
          <div className="space-y-2">
            <p className="text-muted text-sm m-0">まだ投稿した店がありません。</p>
            <Link href={`/${homeCity?.slug ?? "sapporo"}/spots/new`} className="btn btn-secondary">
              ピンを立てる
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {authoredSpots.map((spot) => (
              <li
                key={spot.id}
                className="flex items-center justify-between px-3 py-2"
                style={{ borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}
              >
                <span>{spot.name}</span>
                <span className="flex gap-1">
                  <Tag kind="accent2">{LIFECYCLE_LABEL[spot.status]}</Tag>
                  {spot.status === "published" ? (
                    <Tag kind="neutral">{authoredSpotQuietnessLabel(spot.quietness)}</Tag>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* SPEC §9.12-6: 承認待ち一覧（S2地図の下部にも同じ導線を追加済み）への
            導線を /me からも開けるようにする。 */}
        <p className="text-sm m-0">
          <Link href={`/${homeCity?.slug ?? "sapporo"}/spots/new#pending-spots`} style={{ color: "var(--color-accent-700)" }}>
            承認待ちのピンを見る →
          </Link>
        </p>
      </section>

      {/* SPEC §9.13.3: pendingRequestCount は回答できる依頼（期限到来済みの open ＋ dormant 復帰の対象になる
          最新の missed）だけの件数。期限前の依頼は「確認待ち」に数えない（getProfileStats が数える）。 */}
      <Card elevation="sm">
        <h3 className="m-0">確認待ちが{stats.pendingRequestCount}件あります</h3>
        <p className="m-0">答えないままのピンは、90日後に地図から静かに外れます。</p>
      </Card>

      <Disclaimer />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-3" style={{ borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
      <p className="m-0 text-2xl" style={{ fontFamily: "var(--font-heading)", fontWeight: 900 }}>
        <AnimatedCounter value={value} />
      </p>
      <p className="m-0 text-muted text-xs">{label}</p>
    </div>
  );
}

function Avatar({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- 外部URLのアバター画像をそのまま表示する
    return <img src={avatarUrl} alt={displayName} className="w-16 h-16 rounded-full object-cover" />;
  }

  return (
    <div
      className="w-16 h-16 rounded-full flex items-center justify-center text-xl"
      style={{ background: "var(--color-accent-200)", color: "var(--color-accent-800)" }}
      aria-hidden
    >
      {displayName.slice(0, 1)}
    </div>
  );
}
