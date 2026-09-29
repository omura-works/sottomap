// "use client" 不要（サーバー部品からも使える）。飾りなので aria-hidden。
import type { CSSProperties } from "react";

export interface LampDotsProps {
  /** 点の数（既定 16）。 */
  count?: number;
  /** 北から南へ（top の小さい順に）1つずつ灯る入場を付ける。 */
  ignite?: boolean;
  /** 灯るずらし（ミリ秒、既定 50）。 */
  stepMs?: number;
  /** 包みのクラス。 */
  className?: string;
  /** 各点のクラス（/start の `.start-light` など）。 */
  dotClassName?: string;
}

export interface LampDot {
  index: number;
  left: number;
  top: number;
  size: number;
  warm: boolean;
  /** 北から南への順番（top の小さい順）。 */
  order: number;
}

/** 今の /start の `LIGHTS` の式をそのまま使う（SPEC motion §2.10）。 */
export function lampDotLayout(count: number): LampDot[] {
  const dots = Array.from({ length: count }, (_, i) => ({
    index: i,
    left: 4 + ((i * 37 + 11) % 92),
    top: 8 + ((i * 53) % 84),
    size: 2 + (i % 3),
    warm: i % 3 !== 0,
    order: 0,
  }));
  const byTop = [...dots].sort((a, b) => a.top - b.top || a.index - b.index);
  byTop.forEach((dot, order) => {
    dot.order = order;
  });
  return dots;
}

/** 夜の面に散らばる灯りの点。暖色（橙）と生成りの2種類。 */
export function LampDots({ count = 16, ignite = false, stepMs = 50, className, dotClassName }: LampDotsProps) {
  return (
    <div className={["lamp-dots", className].filter(Boolean).join(" ")} aria-hidden="true">
      {lampDotLayout(count).map((dot) => (
        <span
          key={dot.index}
          className={["lamp-dot", ignite ? "lamp-dot-ignite" : null, dotClassName].filter(Boolean).join(" ")}
          data-warm={dot.warm ? "true" : "false"}
          style={
            {
              left: `${dot.left}%`,
              top: `${dot.top}%`,
              width: dot.size,
              height: dot.size,
              "--dot": `${dot.size}px`,
              "--d": `${dot.order * stepMs}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
