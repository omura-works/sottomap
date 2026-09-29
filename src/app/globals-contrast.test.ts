import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Codex R26 重要2・重要3・軽微1: トークンの実測コントラストとタッチ領域を固定する（WCAG 2.x の相対輝度で計算）。
const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const startCss = readFileSync(resolve(process.cwd(), "src/app/start/start.css"), "utf8");

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6});`));
  if (!match) throw new Error(`token --color-${name} が見つからない`);
  return match[1];
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`${selector} が見つからない`);
  return css.slice(start, css.indexOf("}", start));
}

describe("トークンのコントラスト", () => {
  it("主ボタン・選択中の塗り（accent-600）に neutral-100 / bg の文字で 4.5:1 以上", () => {
    expect(contrast(token("neutral-100"), token("accent-600"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("bg"), token("accent-600"))).toBeGreaterThanOrEqual(4.5);
  });

  it("placeholder（neutral-700）は入力欄の地（neutral-100）に 4.5:1 以上", () => {
    expect(block(".input::placeholder")).toContain("var(--color-neutral-700)");
    expect(contrast(token("neutral-700"), token("neutral-100"))).toBeGreaterThanOrEqual(4.5);
  });

  it("入力欄・ラジオ・セグメントの枠（neutral-600）は neutral-100 と bg の両方に 3:1 以上", () => {
    // 入力欄とセグメントの外枠は 1.5px（SPEC motion §2.9）、ラジオの丸は 1px のまま
    for (const selector of [".input", ".seg"]) {
      expect(block(selector)).toContain("border: 1.5px solid var(--color-neutral-600)");
    }
    expect(block(".radio .dot")).toContain("border: 1px solid var(--color-neutral-600)");
    expect(contrast(token("neutral-600"), token("neutral-100"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("neutral-600"), token("bg"))).toBeGreaterThanOrEqual(3);
  });

  it("暗い面（neutral-900）のフォーカスの輪は accent-300 で 3:1 以上", () => {
    // SPEC motion §6.3: 夜の面すべてに --ring を置き、base 層の輪がそれを使う
    expect(css).toMatch(
      /\.night-card,\s*\.night-band,\s*\.login-night,\s*\.sticky\[data-tone="night"\],\s*\.lantern-badge \{\s*--ring: var\(--color-accent-300\);/,
    );
    expect(css).toMatch(/:focus-visible \{\s*outline: 2px solid var\(--ring, var\(--color-accent-600\)\);/);
    expect(startCss).toMatch(/\.start-city-chip:focus-visible > span \{\s*outline: 2px solid var\(--color-accent-300\)/);
    expect(contrast(token("accent-300"), token("neutral-900"))).toBeGreaterThanOrEqual(3);
  });
});

// SPEC motion §2.4・§6.1: 使ってよい字と地の組み合わせ（期待は §2.4 の比）。
describe("灯りの地図帳の配色（SPEC motion §6.1）", () => {
  const cases: Array<[string, string, string, number]> = [
    ["判子「静」", "accent-2-900", "accent-2-400", 4.5],
    ["判子「並」", "accent-900", "accent-400", 4.5],
    ["判子「観」", "neutral-100", "neutral-700", 4.5],
    ["夜の主ボタン", "text", "accent-400", 4.5],
    ["夜の主ボタン（押した時）", "text", "accent-500", 4.5],
    ["紙の主ボタン", "neutral-100", "accent-600", 4.5],
    ["夜の上の強調", "accent-300", "neutral-900", 4.5],
    ["夜のリード", "neutral-300", "neutral-900", 4.5],
    ["夜の補助", "neutral-400", "neutral-900", 4.5],
    ["夜の下限", "neutral-500", "neutral-900", 4.5],
    ["夜の上の灯りの字", "accent-400", "neutral-900", 4.5],
    ["紙の上の強調（bg）", "accent-700", "bg", 4.5],
    ["紙の上の強調（neutral-100）", "accent-700", "neutral-100", 4.5],
    ["紙の上の大きな数字（24px 以上だけ）", "accent-600", "bg", 3],
    ["橙の付箋の本文", "accent-800", "accent-200", 4.5],
    ["橙の付箋の補助", "text-muted", "accent-200", 4.5],
    ["橙の付箋の小さな数字", "accent-700", "accent-200", 4.5],
    ["橙の付箋の大きな数字（24px 以上だけ）", "accent-600", "accent-200", 3],
    ["苔の付箋の本文", "accent-2-800", "accent-2-200", 4.5],
    ["苔の付箋の数字", "accent-2-700", "accent-2-200", 4.5],
    ["砂の上の補助", "text-muted", "surface", 4.5],
    ["選択の丸囲み・選択中のピンの輪（bg）", "accent-600", "bg", 3],
    ["選択の丸囲み・選択中のピンの輪（neutral-100）", "accent-600", "neutral-100", 3],
  ];
  it.each(cases)("%s: %s / %s は %s:1 以上", (_name, fg, bg, min) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(min);
  });

  it("判子の輪郭（neutral-800）は淡いタイル（#e8e6df）との境目 3:1 以上", () => {
    expect(contrast(token("neutral-800"), "#e8e6df")).toBeGreaterThanOrEqual(3);
  });

  it("夜の上で accent-600 を使わない根拠: accent-600 / neutral-900 は 3:1 未満", () => {
    expect(contrast(token("accent-600"), token("neutral-900"))).toBeLessThan(3);
  });

  it("判子の配色は §2.4 のとおり（CSS）", () => {
    expect(block('.stamp[data-tone="quiet"]')).toMatch(/--bgc: var\(--color-accent-2-400\);\s*color: var\(--color-accent-2-900\)/);
    expect(block('.stamp[data-tone="crowding"]')).toMatch(/--bgc: var\(--color-accent-400\);\s*color: var\(--color-accent-900\)/);
    expect(block('.stamp[data-tone="touristy"]')).toMatch(/--bgc: var\(--color-neutral-700\);\s*color: var\(--color-neutral-100\)/);
  });
});

describe("タッチ領域", () => {
  it(".seg-opt（当たり判定の label）は高さ 44px（--control-height）以上", () => {
    expect(css).toMatch(/--control-height: 44px;/);
    expect(block(".seg-opt")).toContain("min-height: var(--control-height)");
  });

  it(".radio（ラベル全体）は高さ 44px 以上", () => {
    expect(block(".radio")).toContain("min-height: 44px");
  });
});
