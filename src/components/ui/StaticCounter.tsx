import type { ReactNode } from "react";
import { cn } from "./cn";
import { FACES, FADE, format, LINE, measure, mod, toCells, WHEEL } from "./counter-shape";
import type { AnimatedCounterProps } from "./AnimatedCounter";

/**
 * AnimatedCounter の止まっている姿（サーバー描画と同じ HTML）を、motion を読まずに描く。
 * `LazyAnimatedCounter` が、数字が変わるまでこれを出し、変わったときに AnimatedCounter を読み込んで差し替える。
 * HTML が同じなので差し替えても字は動かない（`StaticCounter.test.tsx` が AnimatedCounter のサーバー描画と比べる）。
 */
const SIZER = FACES.map((face) => (
  <span key={face} aria-hidden className="invisible [grid-area:1/1]">
    {face}
  </span>
));

const STACK = WHEEL.map((face, index) => (
  <span key={index} className="flex items-center justify-center" style={{ height: `${LINE}em` }}>
    {face}
  </span>
));

/** motion が y から作る transform と同じ文字列（0 のときは motion も "none" を書く）。 */
function wheelTransform(digit: number): string {
  const face = mod(digit, 10);
  return face === 0 ? "none" : `translateY(${(-face * 100) / WHEEL.length}%)`;
}

function Fixed({ children }: { children: ReactNode }) {
  return <span className="inline-block">{children}</span>;
}

export function StaticCounter({
  value,
  decimals = 0,
  duration = 0.6,
  padStart = 1,
  separator = ",",
  decimalSeparator = ".",
  grouping = "western",
  prefix,
  suffix,
  className,
  ...props
}: AnimatedCounterProps) {
  const shape = measure(value, decimals, padStart, duration);
  const chars = format(shape, separator, decimalSeparator, grouping);
  const cells = toCells(chars, shape.width);
  const negative = shape.amount < 0 && shape.scaled > 0;

  return (
    <span data-slot="animated-counter" className={cn("inline-flex items-center tabular-nums", className)} {...props}>
      {prefix != null && <Fixed>{prefix}</Fixed>}
      <span className="sr-only">
        {negative ? "-" : ""}
        {chars}
      </span>
      <span aria-hidden className="inline-flex select-none items-center">
        {negative && <Fixed>-</Fixed>}
        {cells.map((cell) =>
          cell.kind === "digit" ? (
            <span
              key={cell.key}
              data-slot="animated-counter-digit"
              className="relative inline-grid overflow-hidden"
              style={{ height: `${LINE}em`, lineHeight: LINE, maskImage: FADE, WebkitMaskImage: FADE, opacity: 1 }}
            >
              {SIZER}
              <span
                className="absolute inset-x-0 top-0"
                style={{ transform: wheelTransform(cell.digit) }}
              >
                {STACK}
              </span>
            </span>
          ) : (
            <span key={cell.key} data-slot="animated-counter-mark" className="inline-block" style={{ opacity: 1 }}>
              {cell.char}
            </span>
          ),
        )}
      </span>
      {suffix != null && <Fixed>{suffix}</Fixed>}
    </span>
  );
}
