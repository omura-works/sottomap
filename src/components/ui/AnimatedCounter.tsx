// Rare UI (MIT) https://rareui.com — そっとマップ向けに調整
// 出典: https://github.com/swamimalode07/rare-ui（`.superpowers/sdd/urasupo/rareui/animated-counter.json`）
// 調整点: import元を `@/lib/utils` → `@/components/ui/cn`（このプロジェクトの共有ヘルパー）に変更。
// 見た目・挙動（`prefers-reduced-motion` 対応・sr-only の数字表示）は変更していない。
// P7: motion に依存しない桁の計算と定数を `counter-shape.ts` へ移した（静かな版 StaticCounter と共有するため。中身は同じ）。
"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, ReactNode, Ref } from "react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Transition,
} from "motion/react";

import { cn } from "./cn";
import { FACES, FADE, format, LINE, measure, mod, toCells, WHEEL } from "./counter-shape";
import type { Grouping } from "./counter-shape";

export type { Grouping } from "./counter-shape";

const EASE = [0.22, 1, 0.36, 1] as const;
const BOUNCE = 0.18;
const LEAVE = { duration: 0.18, ease: EASE } as const;
const INSTANT = { duration: 0 } as const;

const spring = (duration: number): Transition => ({
  type: "spring",
  visualDuration: duration,
  bounce: BOUNCE,
});

// built once so React skips reconciling 21 spans per digit on every change
const SIZER = FACES.map((face) => (
  <span key={face} aria-hidden className="invisible [grid-area:1/1]">
    {face}
  </span>
));

const STACK = WHEEL.map((face, index) => (
  <span
    key={index}
    className="flex items-center justify-center"
    style={{ height: `${LINE}em` }}
  >
    {face}
  </span>
));

function useWheel(
  from: number,
  digit: number,
  dir: number,
  duration: number,
  reduced: boolean,
) {
  const pos = useMotionValue(from);
  const goal = useRef(from);

  // read rather than depended on: a reversal alone must not restart every column
  const heading = useRef(dir);
  useEffect(() => {
    heading.current = dir;
  }, [dir]);

  useEffect(() => {
    if (reduced) {
      goal.current = digit;
      pos.set(digit);
      return;
    }
    // re-aim only when the face changed, or a reversal sends the wheel the long way round
    if (mod(goal.current, 10) !== digit) {
      // aim from where the wheel is, so a moving value never queues up a backlog of turns
      const at = pos.get();
      goal.current =
        heading.current < 0
          ? at - mod(at - digit, 10)
          : at + mod(digit - at, 10);
    }
    const roll = animate(pos, goal.current, spring(duration));
    return () => roll.stop();
  }, [digit, duration, reduced, pos]);

  return useTransform(pos, (p) => `${(-mod(p, 10) * 100) / WHEEL.length}%`);
}

type SlotProps = {
  reduced: boolean;
  dep: number;
  shift: Transition;
};

const shifts = ({ reduced, dep, shift }: SlotProps) => ({
  layout: !reduced,
  layoutDependency: dep,
  transition: shift,
});

const fades = (reduced: boolean) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: reduced ? INSTANT : LEAVE },
});

function Fixed({ children, ...slot }: SlotProps & { children: ReactNode }) {
  return (
    <motion.span {...shifts(slot)} className="inline-block">
      {children}
    </motion.span>
  );
}

function Mark({
  char,
  ref,
  ...slot
}: SlotProps & { char: string; ref?: Ref<HTMLSpanElement> }) {
  return (
    <motion.span
      ref={ref}
      data-slot="animated-counter-mark"
      {...shifts(slot)}
      {...fades(slot.reduced)}
      className="inline-block"
    >
      {char}
    </motion.span>
  );
}

const Digit = memo(function Digit({
  digit,
  from,
  dir,
  duration,
  ref,
  ...slot
}: SlotProps & {
  digit: number;
  from: number;
  dir: number;
  duration: number;
  // popLayout measures the leaving column through this
  ref?: Ref<HTMLSpanElement>;
}) {
  const y = useWheel(from, digit, dir, duration, slot.reduced);

  return (
    <motion.span
      ref={ref}
      data-slot="animated-counter-digit"
      {...shifts(slot)}
      {...fades(slot.reduced)}
      className="relative inline-grid overflow-hidden"
      style={{
        height: `${LINE}em`,
        lineHeight: LINE,
        maskImage: FADE,
        WebkitMaskImage: FADE,
      }}
    >
      {/* widest-face width, for fonts with no tabular figures */}
      {SIZER}
      <motion.span style={{ y }} className="absolute inset-x-0 top-0">
        {STACK}
      </motion.span>
    </motion.span>
  );
});

export type AnimatedCounterProps = Omit<
  ComponentProps<"span">,
  | "children"
  | "prefix"
  | "onAnimationStart"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
> & {
  value: number;
  decimals?: number;
  duration?: number;
  padStart?: number;
  separator?: string;
  decimalSeparator?: string;
  grouping?: Grouping;
  prefix?: ReactNode;
  suffix?: ReactNode;
};

export function AnimatedCounter({
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
  const reduced = useReducedMotion() ?? false;

  const shape = measure(value, decimals, padStart, duration);
  const chars = format(shape, separator, decimalSeparator, grouping);
  const cells = toCells(chars, shape.width);
  const negative = shape.amount < 0 && shape.scaled > 0;

  const [previous, setPrevious] = useState(shape.amount);
  const [dir, setDir] = useState(1);
  if (previous !== shape.amount) {
    setDir(shape.amount >= previous ? 1 : -1);
    setPrevious(shape.amount);
  }

  // faces at mount; a place that appears later starts from 0 and rolls in
  const [seed] = useState(() => {
    const faces: Record<number, number> = {};
    for (const cell of cells) {
      if (cell.kind === "digit") faces[cell.key] = cell.digit;
    }
    return faces;
  });

  const shift = useMemo<Transition>(
    () => (reduced ? INSTANT : spring(shape.pace)),
    [reduced, shape.pace],
  );

  const slot: SlotProps = { reduced, dep: chars.length, shift };

  return (
    <span
      data-slot="animated-counter"
      className={cn("inline-flex items-center tabular-nums", className)}
      {...props}
    >
      {prefix != null && <Fixed {...slot}>{prefix}</Fixed>}

      <span className="sr-only">
        {negative ? "-" : ""}
        {chars}
      </span>

      <span aria-hidden className="inline-flex select-none items-center">
        {negative && <Fixed {...slot}>-</Fixed>}
        <AnimatePresence mode="popLayout" initial={false}>
          {cells.map((cell) =>
            cell.kind === "digit" ? (
              <Digit
                key={cell.key}
                {...slot}
                digit={cell.digit}
                from={seed[cell.key] ?? 0}
                dir={dir}
                duration={shape.pace}
              />
            ) : (
              <Mark key={cell.key} {...slot} char={cell.char} />
            ),
          )}
        </AnimatePresence>
      </span>

      {suffix != null && <Fixed {...slot}>{suffix}</Fixed>}
    </span>
  );
}

export default AnimatedCounter;
