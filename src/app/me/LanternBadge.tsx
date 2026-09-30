import type { CSSProperties } from "react";
import type { Badge } from "@/lib/db/types";
import { badgeThreshold } from "@/lib/domain/lantern";
import { Lantern } from "@/components/illustrations/Lantern";

/** 火の粉の向き（度）。取ったバッジの漢字の周りに6つ。 */
const SPARK_ANGLES = [0, 60, 120, 180, 240, 300] as const;

/**
 * 進み具合の棒（SPEC motion §5.6）。幅は動かさず、満ちた部分を `scale: var(--p) 1` で描く（`--p` は 0〜1）。
 * 先に光の粒。`role="progressbar"` と `aria-*` はそのまま。確認の画面（番人の棒）でも使う。
 */
export function LanternProgress({
  current,
  threshold,
  label,
  p,
  className,
  lampTarget,
}: {
  current: number;
  threshold: number;
  label: string;
  /** 見た目の満ち具合（0〜1）。省略時は current / threshold。 */
  p?: number;
  className?: string;
  lampTarget?: "keeper-bar";
}) {
  const ratio = p ?? (threshold > 0 ? Math.min(1, Math.max(0, current / threshold)) : 0);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={threshold}
      aria-valuenow={current}
      aria-valuetext={`${threshold}件のうち${current}件`}
      className={["lantern-progress", className].filter(Boolean).join(" ")}
      style={{ "--p": ratio } as CSSProperties}
    >
      <span className="lantern-progress-fill" aria-hidden="true" />
      <span className="lantern-progress-sheen" aria-hidden="true" />
      <span className="lantern-spark" aria-hidden="true" data-lamp-target={lampTarget} />
    </div>
  );
}

/**
 * `/me`「灯り」の1つのバッジ（SPEC motion §5.6、夜のカード）。上の行に提灯と漢字（取ったものは提灯と漢字の後ろの光が点く）、
 * 名前、進み具合の棒と「ともりました」「あと○件でともる」。取ったバッジの周りに火の粉。
 * 画面に入ったときの動き（棒が光で満ちる・光が灯る・火の粉）は、包みの `Reveal` の data-reveal で CSS が付ける。
 */
export function LanternBadge({ badge }: { badge: Badge }) {
  const threshold = badgeThreshold(badge.slug);
  const current = badge.earned ? threshold : Math.max(threshold - badge.remaining, 0);

  return (
    <div className="night-card lantern-badge" data-earned={badge.earned ? "true" : "false"}>
      <div className="lantern-badge-top">
        <Lantern size={42} lit={badge.earned} tone="night" className="lantern-badge-lantern" />
        <span className="lantern-badge-kanji-wrap" aria-hidden="true">
          <span className="lantern-badge-glow" />
          {badge.earned
            ? SPARK_ANGLES.map((angle) => (
                <span key={angle} className="lantern-badge-spark" style={{ "--a": `${angle}deg` } as CSSProperties} />
              ))
            : null}
          <span className="lantern-badge-kanji">{badge.glyph}</span>
        </span>
      </div>
      <span className="lantern-badge-name">{badge.label}</span>
      {threshold > 0 ? <LanternProgress current={current} threshold={threshold} label={`${badge.label}の進み具合`} /> : null}
      <span className="lantern-badge-state">{badge.earned ? "ともりました" : `あと${badge.remaining}件でともる`}</span>
    </div>
  );
}
