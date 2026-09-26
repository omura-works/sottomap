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
    for (const selector of [".input", ".radio .dot", ".seg"]) {
      expect(block(selector)).toContain("border: 1px solid var(--color-neutral-600)");
    }
    expect(contrast(token("neutral-600"), token("neutral-100"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token("neutral-600"), token("bg"))).toBeGreaterThanOrEqual(3);
  });

  it("暗い面（neutral-900）のフォーカスの輪は accent-300 で 3:1 以上", () => {
    expect(block(".night-card :focus-visible")).toContain("var(--color-accent-300)");
    expect(startCss).toMatch(/\.start-city-chip:focus-visible > span \{\s*outline: 2px solid var\(--color-accent-300\)/);
    expect(contrast(token("accent-300"), token("neutral-900"))).toBeGreaterThanOrEqual(3);
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
