import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss, { type AtRule, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

// 2026-09-26 の不具合: .btn 系を @layer components に移したとき、レイヤーの外に残っていた `a { color }` が
// 部品より強くなり、<a class="btn btn-primary"> の文字が暗く読めなくなった（カスケードレイヤーでは、
// レイヤー外の規則は詳細度に関係なくレイヤー内の規則に勝つ）。部品が要素の既定に必ず勝つ並びを固定する。
// 実際の計算済みスタイルは e2e/prodready.spec.ts で <a> と <button> の両方について確認している。

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const root = postcss.parse(css);

function layerOf(rule: Rule): string | null {
  let parent = rule.parent;
  while (parent && parent.type !== "root") {
    if (parent.type === "atrule" && (parent as AtRule).name === "layer") {
      return (parent as AtRule).params.trim();
    }
    parent = parent.parent;
  }
  return null;
}

function rulesFor(selector: string): Rule[] {
  const found: Rule[] = [];
  root.walkRules((rule) => {
    if (rule.selectors.map((s) => s.trim()).includes(selector)) found.push(rule);
  });
  return found;
}

// 部品が付く要素（a・button）と、フォーカスの既定
const ELEMENT_DEFAULTS = ["a", "button", ":focus", ":focus-visible"];

describe("globals.css のカスケードレイヤー", () => {
  it.each(ELEMENT_DEFAULTS)("%s の既定はレイヤーの外に置かない（部品のクラスに負けるように）", (selector) => {
    for (const rule of rulesFor(selector)) {
      expect(layerOf(rule)).not.toBeNull();
    }
  });

  it("a の既定の色は @layer base にある", () => {
    const rules = rulesFor("a");
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(layerOf(rule)).toBe("base");
  });

  it.each([".btn", ".btn-primary", ".btn-secondary", ".btn-ghost"])("%s は @layer components で文字色を持つ", (selector) => {
    const rules = rulesFor(selector);
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(layerOf(rule)).toBe("components");
    const colorDecl = rules.flatMap((rule) => rule.nodes).find((node) => node.type === "decl" && node.prop === "color");
    // .btn-secondary は .btn の color（--color-text）を使う
    if (selector !== ".btn-secondary") expect(colorDecl).toBeDefined();
  });

  it("レイヤー外の規則は color を持つ要素セレクタ（a など）を含まない", () => {
    const offenders: string[] = [];
    root.walkRules((rule) => {
      if (layerOf(rule) !== null) return;
      const setsColor = rule.nodes.some((node) => node.type === "decl" && node.prop === "color");
      if (!setsColor) return;
      for (const selector of rule.selectors) {
        if (/^(a|button|input|select|textarea|label|span|li)\b/.test(selector.trim())) offenders.push(selector);
      }
    });
    expect(offenders).toEqual([]);
  });

  it("Tailwind の読み込み（base → components の順を宣言する）が先頭にある", () => {
    const first = root.nodes.find((node) => node.type === "atrule");
    expect(first?.type === "atrule" && first.name === "import" && first.params.includes("tailwindcss")).toBe(true);
  });
});
