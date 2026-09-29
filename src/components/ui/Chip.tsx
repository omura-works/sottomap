import type { ReactNode } from "react";
import { HandLine } from "@/components/illustrations/HandLine";
import { cn } from "./cn";

export interface ChipProps {
  /** 選ばれているか。塗りが押した位置から円で広がり（280ms）、外すと逆に閉じる（160ms）。 */
  on: boolean;
  /** "paper": 紙の上（地 neutral-100・細線の枠）。"sand": /start の紙の札の中（地 surface・枠なし）。 */
  surface?: "paper" | "sand";
  className?: string;
  children: ReactNode;
}

/**
 * チップの見た目（SPEC motion §2.9）。押せる要素ではない: 当たり判定の包み（`.chip-hit` / `.start-city-chip`、
 * 44px）の中に置き、`aria-pressed` などは包みの側に付ける。
 * 選ばれた塗りは同じ字を重ねた層（`aria-hidden`）で描く。押した位置は `MotionRoot` が `--px`/`--py` に書く。
 */
export function Chip({ on, surface = "paper", className, children }: ChipProps) {
  return (
    <span className={cn("chip", className)} data-on={on ? "true" : "false"} data-surface={surface}>
      <span className="chip-label">{children}</span>
      <span className="chip-fill" aria-hidden="true">
        <HandLine variant="check" className="chip-check" />
        {children}
      </span>
    </span>
  );
}
