import { getCity } from "@/lib/db/spots";
import { resolveBadges } from "@/lib/domain/lantern";
import { quietnessLabel } from "@/lib/domain/quietness";
import { Card, Divider, Tag } from "@/components/ui";
import { Disclaimer } from "@/components/profile/Disclaimer";
import { DEMO_PROFILE, DEMO_AUTHORED_SPOTS } from "@/components/profile/demo-user";

/**
 * S7「プロフィール」`/me`。
 * 認証未結線（Task 6 待ち）のため `demo-user.ts` の固定プロフィールを使う
 * （SPEC §7 の方針どおり、確認人数・ポイント・バッジ数値はもともと架空データとして
 * 明記される前提のため矛盾しない）。居住地の街名だけは `getCity` で実データを引く。
 */
export default async function ProfilePage() {
  const homeCity = await getCity("sapporo");
  const cityName = homeCity?.name ?? "札幌";

  const badges = resolveBadges({
    verificationCount: DEMO_PROFILE.verificationCount,
    winterVerificationCount: DEMO_PROFILE.winterVerificationCount,
    publishedPortSpotCount: DEMO_PROFILE.publishedPortSpotCount,
    publishedSpotCount: DEMO_PROFILE.postedSpotCount,
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 lg:py-10 space-y-8">
      <header className="flex items-center gap-4">
        <Avatar avatarUrl={DEMO_PROFILE.avatarUrl} displayName={DEMO_PROFILE.displayName} />
        <div>
          <h2 className="m-0">{DEMO_PROFILE.displayName}</h2>
          <p className="text-muted m-0">
            {cityName}・{DEMO_PROFILE.areaName}に{DEMO_PROFILE.residentYears}年
          </p>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-3 text-center">
        <Stat label="立てたピン" value={DEMO_PROFILE.postedSpotCount} />
        <Stat label="確認した回数" value={DEMO_PROFILE.verificationCount} />
        <Stat label="静けさを守った店" value={DEMO_PROFILE.keptQuietSpotCount} />
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
        <ul className="space-y-2">
          {DEMO_AUTHORED_SPOTS.map((spot) => (
            <li
              key={spot.name}
              className="flex items-center justify-between px-3 py-2"
              style={{ borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}
            >
              <span>{spot.name}</span>
              <Tag kind="accent2">{quietnessLabel(spot.quietness)}</Tag>
            </li>
          ))}
        </ul>
      </section>

      <Card elevation="sm">
        <h3 className="m-0">確認待ちが{DEMO_PROFILE.pendingVerificationCount}件あります</h3>
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
        {value}
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
