import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DUR, EASE, STAGGER, staggerDelay } from "./tokens";

// SPEC motion §8.2: JS の DUR と globals.css の --dur-* が同じ値であること（CSS を文字列で読んで比べる）。
const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

/** 最初に出てくる定義（:root）の値。reduce の @media で 0ms にする上書きは見ない。 */
function firstValue(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`${name} が globals.css に無い`);
  return match[1].trim();
}

function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

describe("動きのトークン", () => {
  it.each(Object.entries(DUR))("DUR.%s は --dur-* と同じ", (key, ms) => {
    expect(firstValue(`--dur-${kebab(key)}`)).toBe(`${ms}ms`);
  });

  it("ずらしは --stagger・--stagger-pin と同じ", () => {
    expect(firstValue("--stagger")).toBe(`${STAGGER.step}ms`);
    expect(firstValue("--stagger-pin")).toBe(`${STAGGER.pinStep}ms`);
  });

  it.each(Object.entries(EASE))("EASE.%s は --ease-* と同じ", (key, points) => {
    expect(firstValue(`--ease-${kebab(key)}`)).toBe(`cubic-bezier(${points.join(", ")})`);
  });

  it("reduce では大きな動きの長さを 0 にする", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const name of ["enter", "stamp", "settle", "stage", "draw", "tuck", "pop", "ignite"]) {
      expect(reduced).toContain(`--dur-${name}: 0ms;`);
    }
  });

  it("ずらしは 8個目（index 7）で打ち止め", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(3)).toBe(135);
    expect(staggerDelay(7)).toBe(315);
    expect(staggerDelay(20)).toBe(315);
    expect(staggerDelay(-2)).toBe(0);
  });
});
