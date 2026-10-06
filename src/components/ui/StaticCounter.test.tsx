import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnimatedCounter } from "./AnimatedCounter";
import type { AnimatedCounterProps } from "./AnimatedCounter";
import { StaticCounter } from "./StaticCounter";

const CASES: AnimatedCounterProps[] = [
  { value: 0 },
  { value: 5, className: "x" },
  { value: 38 },
  { value: 412 },
  { value: 1234 },
  { value: 1234567, grouping: "indian" },
  { value: -7 },
  { value: 3.25, decimals: 2 },
  { value: 9, padStart: 3 },
  { value: 5, prefix: "¥", suffix: "軒" },
];

describe("StaticCounter", () => {
  it.each(CASES)("AnimatedCounter のサーバー描画と同じ HTML（%o）", (props) => {
    expect(renderToStaticMarkup(<StaticCounter {...props} />)).toBe(renderToStaticMarkup(<AnimatedCounter {...props} />));
  });
});
