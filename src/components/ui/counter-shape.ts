// Rare UI (MIT) https://rareui.com の AnimatedCounter から、motion に依存しない部分（桁の形の計算と定数）を切り出したもの。
// AnimatedCounter と、動く前の静かな版（StaticCounter）が同じ形を描くために共有する（P7: 最初に読む JS を減らすため）。
// 中身は元のまま（名前に export を付けただけ）。

export const FACES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
// the trailing 0 makes the wrap from 9 back to 0 land on an identical face
export const WHEEL = [...FACES, 0];

// the air around each face is what the mask fades through, so a resting digit stays solid
export const LINE = 1.5;
// eased rather than a straight ramp; a linear fade of the same width reads as a hard edge
export const FADE = `linear-gradient(to bottom,
  rgba(0,0,0,0) 0%,
  rgba(0,0,0,0.06) 5.5%,
  rgba(0,0,0,0.5) 11%,
  rgba(0,0,0,0.94) 16.5%,
  #000 22%,
  #000 78%,
  rgba(0,0,0,0.94) 83.5%,
  rgba(0,0,0,0.5) 89%,
  rgba(0,0,0,0.06) 94.5%,
  rgba(0,0,0,0) 100%)`;

export const MAX_DECIMALS = 15;
export const MAX_PAD = 24;
export const MIN_DURATION = 0.01;
export const MAX_DURATION = 60;

export const mod = (n: number, m: number) => ((n % m) + m) % m;
export const clamp = (n: number, low: number, high: number) =>
  Math.min(high, Math.max(low, Number.isFinite(n) ? n : low));
export const isDigit = (char: string) => char >= "0" && char <= "9";

export type Grouping = "western" | "indian";

export const EVERY_THREE = /\B(?=(\d{3})+(?!\d))/g;
export const EVERY_TWO = /\B(?=(\d{2})+(?!\d))/g;

export function group(whole: string, separator: string, grouping: Grouping) {
  if (!separator) return whole;
  if (grouping !== "indian") return whole.replace(EVERY_THREE, separator);

  // indian: three at the end, pairs the rest of the way up
  const head = whole.slice(0, -3);
  if (!head) return whole;
  return `${head.replace(EVERY_TWO, separator)}${separator}${whole.slice(-3)}`;
}

export type Shape = {
  amount: number;
  scaled: number;
  places: number;
  pace: number;
  width: number;
};

export function measure(
  value: number,
  decimals: number,
  padStart: number,
  duration: number,
): Shape {
  // NaN would make the previous-value comparison true forever
  const amount = Number.isFinite(value) ? value : 0;
  const places = clamp(Math.trunc(decimals), 0, MAX_DECIMALS);
  const pad = clamp(Math.trunc(padStart), 1, MAX_PAD);
  // past MAX_SAFE_INTEGER the digits are noise, and past 1e21 String() turns exponential
  const scaled = Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.round(Math.abs(amount) * 10 ** places),
  );

  return {
    amount,
    scaled,
    places,
    pace: clamp(duration, MIN_DURATION, MAX_DURATION),
    width: Math.max(String(scaled).length, places + pad),
  };
}

export function format(
  { scaled, places, width }: Shape,
  separator: string,
  decimalSeparator: string,
  grouping: Grouping,
) {
  const raw = String(scaled).padStart(width, "0");
  const whole = group(
    raw.slice(0, raw.length - places) || "0",
    separator,
    grouping,
  );
  return places
    ? `${whole}${decimalSeparator}${raw.slice(raw.length - places)}`
    : whole;
}

// keyed by distance from the right, so gaining a place moves columns rather than remounting them
export type Cell =
  | { kind: "digit"; key: number; digit: number }
  | { kind: "mark"; key: string; char: string };

export function toCells(chars: string, width: number): Cell[] {
  const cells: Cell[] = [];
  let seen = 0;
  // only digits advance the place, so a multi-character separator would repeat a key
  let run = 0;

  for (const char of chars) {
    if (isDigit(char)) {
      run = 0;
      cells.push({ kind: "digit", key: width - seen++, digit: Number(char) });
    } else {
      cells.push({ kind: "mark", key: `mark-${width - seen}-${run++}`, char });
    }
  }
  return cells;
}
