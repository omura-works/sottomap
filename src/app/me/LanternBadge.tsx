import type { Badge } from "@/lib/db/types";
import { badgeThreshold } from "@/lib/domain/lantern";

/**
 * `/me`「灯り」の1つのバッジ（2026-09-26 案B）。夜のカード（.night-card）に、左に漢字・右に名前、
 * 下に進み具合の細い棒と「あと○件」。取得済みは漢字が灯り、棒は満タン。
 * 進み具合は棒（role="progressbar"）の aria-valuenow / aria-valuemax で読み上げにも伝える。
 */
export function LanternBadge({ badge }: { badge: Badge }) {
  const threshold = badgeThreshold(badge.slug);
  const current = badge.earned ? threshold : Math.max(threshold - badge.remaining, 0);
  const percent = threshold > 0 ? Math.round((current / threshold) * 100) : badge.earned ? 100 : 0;

  return (
    <div className="night-card flex h-full flex-col gap-2.5 p-5" style={{ borderRadius: 14, boxShadow: "none" }}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          style={{
            fontFamily: "var(--font-heading), serif",
            fontSize: 30,
            lineHeight: 1.2,
            color: badge.earned ? "var(--color-accent-200)" : "var(--color-neutral-400)",
            textShadow: badge.earned ? "0 0 14px color-mix(in srgb, var(--color-accent-400) 75%, transparent)" : "none",
          }}
        >
          {badge.glyph}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-bg)" }}>{badge.label}</span>
      </div>
      {threshold > 0 ? (
        <div
          role="progressbar"
          aria-label={`${badge.label}の進み具合`}
          aria-valuemin={0}
          aria-valuemax={threshold}
          aria-valuenow={current}
          aria-valuetext={`${threshold}件のうち${current}件`}
          className="lantern-progress"
        >
          <div className="lantern-progress-fill" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      <span style={{ fontSize: 11, color: "var(--color-neutral-400)" }}>
        {badge.earned ? "獲得済み" : `あと${badge.remaining}件`}
      </span>
    </div>
  );
}
