// "use client" 不要（サーバー部品からも使える）。
import type { CSSProperties } from "react";

export type StampTone = "quiet" | "crowding" | "touristy" | "orange" | "moss" | "night";
export type StampSize = 26 | 30 | 48 | 56 | 72;

export interface StampProps {
  /** 判子の字。1字（静・並・観・灯・雪・港・Q など）か2字（受付など）。 */
  glyph: string;
  tone: StampTone;
  /** 直径（px）。26px より小さい判子は作らない（字が 14px を下回るため）。 */
  size: StampSize;
  /** 止まったときの傾き（度）。-6〜+6 まで。 */
  tilt?: number;
  /** "press" で「押す」を1回再生する（初回表示の中で使う。画面の下の方は `Reveal verb="stamp"` で包む）。 */
  animate?: "none" | "press";
  /** 与えたときだけ role="img" と aria-label を付ける。無ければ飾りとして aria-hidden。 */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * 字の大きさ（px）。1字は max(14px, 直径×0.5)、2字以上は max(14px, 直径×0.34)（SPEC motion §2.9・§5.10.1）。
 */
export function stampFontSize(size: number, glyph: string): number {
  const ratio = Array.from(glyph).length >= 2 ? 0.34 : 0.5;
  return Math.max(14, Math.round(size * ratio));
}

/**
 * 判子（SPEC motion §2.9）。丸い面に Mochiy の字。内側の細い輪で判子らしく、外側の neutral-800 の輪郭で
 * 地図・紙の上の境目 3:1 を取る。影は付けない（紙に押したインクだから）。押せない（pointer-events: none）。
 */
export function Stamp({ glyph, tone, size, tilt = 0, animate = "none", label, className, style }: StampProps) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <span
      className={["stamp", animate === "press" ? "verb-stamp" : null, className].filter(Boolean).join(" ")}
      data-tone={tone}
      style={
        {
          "--sz": `${size}px`,
          "--tilt": `${tilt}deg`,
          fontSize: `${stampFontSize(size, glyph)}px`,
          ...style,
        } as CSSProperties
      }
      {...a11y}
    >
      {glyph}
    </span>
  );
}
