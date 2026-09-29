// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden。
import type { CSSProperties } from "react";

export interface LanternChildProps {
  /** 直径（px、36〜96）。 */
  size?: number;
  /** "front": 正面を見る。"around": 横を見る（目を少し右上へ寄せる）。 */
  look?: "front" | "around";
  /** 描かれたときに1回だけまばたきする（120ms）。 */
  blink?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** 灯りの子（SPEC motion §2.10）: 橙の丸に、墨の目が2つ。空の状態などでひと言に添える。 */
export function LanternChild({ size = 48, look = "front", blink = true, className, style }: LanternChildProps) {
  return (
    <span
      className={["lantern-child", blink ? "lantern-child-blink" : null, className].filter(Boolean).join(" ")}
      data-look={look}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
    >
      <span className="lantern-child-eye" data-side="l" />
      <span className="lantern-child-eye" data-side="r" />
    </span>
  );
}
