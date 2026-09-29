/**
 * 動きの値（SPEC motion §3.1・§3.2）。`globals.css` の `--dur-*`・`--ease-*`・`--spring-*` と同じ値を
 * JS 側（motion/react・WAAPI）で使うための写し。値を変えるときは CSS と両方を変える
 * （`tokens.test.ts` が `--dur-*` の一致を確かめている）。
 */

/** 時間（ミリ秒）。CSS の `--dur-{key}` と同じ値。 */
export const DUR = {
  press: 90,
  quick: 160,
  peel: 200,
  base: 240,
  enter: 320,
  stamp: 480,
  settle: 600,
  stage: 640,
  draw: 700,
  tuck: 700,
  pop: 800,
  ignite: 900,
  breath: 2400,
} as const;

export type DurKey = keyof typeof DUR;

/** 並んだ物のずらし（ミリ秒）と打ち止め（index）。 */
export const STAGGER = { step: 45, maxIndex: 7, pinStep: 30, pinMax: 23 } as const;

/** 並んだ物の遅れ（ミリ秒）。8個目（index 7）で打ち止め。 */
export function staggerDelay(index: number, step: number = STAGGER.step): number {
  return Math.min(Math.max(index, 0), STAGGER.maxIndex) * step;
}

/** 3次ベジェの制御点（motion の `ease` にそのまま渡せる形）。CSS の `--ease-*` と同じ値。 */
export const EASE = {
  outSoft: [0.22, 1, 0.36, 1],
  stage: [0.16, 1, 0.3, 1],
  draw: [0.65, 0, 0.35, 1],
  sink: [0.33, 1, 0.68, 1],
  peel: [0.55, 0, 1, 0.45],
  breath: [0.37, 0, 0.63, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** WAAPI の `easing` に渡す文字列。 */
export function cubicBezier(points: readonly [number, number, number, number]): string {
  return `cubic-bezier(${points.join(", ")})`;
}

/**
 * スプリング（motion の transition）。CSS の `linear()` 版（`--spring-*`）と同じ ζ・ω から作った値。
 * 途中で行き先が変わる動き（並べ替え・下部カード・ナビの灯り）に使う。
 */
export const SPRING = {
  /** ぽよん: 大きな字・数字が弾む（ζ0.45・ω14、行き過ぎ 20%） */
  pop: { type: "spring", stiffness: 196, damping: 12.6, mass: 1 },
  /** すっ: 紙が置かれる（ζ0.8・ω12、行き過ぎ 1.5%） */
  settle: { type: "spring", stiffness: 144, damping: 19.2, mass: 1 },
  /** ぎゅっ: 判子・ボタン・ナビの丸（ζ0.5・ω22、行き過ぎ 16%） */
  stamp: { type: "spring", stiffness: 484, damping: 22, mass: 1 },
  /** するり: 栞のリボン（ζ0.6・ω10、行き過ぎ 9.5%） */
  tuck: { type: "spring", stiffness: 100, damping: 12, mass: 1 },
} as const;

/** 退場（はがす）の motion 用の値（§3.5）。 */
export const PEEL_EXIT = {
  opacity: 0,
  y: -8,
  rotate: 2.5,
  transition: { duration: DUR.peel / 1000, ease: EASE.peel },
} as const;
