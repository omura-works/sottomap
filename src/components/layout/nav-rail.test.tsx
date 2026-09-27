import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";
import { SideRail } from "./SideRail";

let mockPathname = "/sapporo";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

// 2026-09-26 の案D: 丸いアイコン枠＋下にラベル。選択中は枠が淡い橙に灯り、アイコンが塗られる。
// （それまでの「文字に沿って伸縮する線」＝ useTabIndicator は、この丸の色の切り替えに置き換えた）
describe.each([
  ["サイドレール", SideRail],
  ["下部タブ", BottomNav],
] as const)("%s（案D）", (_name, Nav) => {
  it("選択中の項目だけが aria-current と灯った丸（data-active）を持ち、アイコンは塗られる", () => {
    mockPathname = "/bookmarks";
    render(<Nav />);
    const active = screen.getByRole("link", { name: "栞" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveAttribute("data-active", "true");
    expect(active.querySelector(".nav-icon-frame svg")).toHaveAttribute("fill", "var(--color-accent-400)");

    for (const label of ["地図", "さがす", "自分"]) {
      const link = screen.getByRole("link", { name: label });
      expect(link).not.toHaveAttribute("aria-current");
      expect(link).not.toHaveAttribute("data-active");
      expect(link.querySelector(".nav-icon-frame svg")).toHaveAttribute("fill", "none");
    }
  });

  it("アイコンは読み上げず、リンクの名前はラベルだけ", () => {
    mockPathname = "/sapporo";
    render(<Nav />);
    const map = screen.getByRole("link", { name: "地図" });
    expect(map).toHaveAttribute("href", "/sapporo");
    expect(within(map).getByText("地図")).toBeInTheDocument();
    expect(map.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("navigation ランドマーク自体が「主要ナビゲーション」という名前を持つ（Codex R27 軽微1）", () => {
    mockPathname = "/sapporo";
    render(<Nav />);
    const nav = screen.getByRole("navigation", { name: "主要ナビゲーション" });
    expect(nav.tagName).toBe("NAV");
    expect(within(nav).getByRole("link", { name: "地図" })).toBeInTheDocument();
  });
});

describe("サイドレールのロゴ", () => {
  it("焦げ茶の角丸正方形に置き、「そっとマップ」の文字は読み上げ用に残す", () => {
    mockPathname = "/sapporo";
    render(<SideRail />);
    const name = screen.getByText("そっとマップ");
    expect(name).toHaveClass("sr-only");
  });
});

describe("globals.css のナビの丸", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  it("選択中の丸は accent-200 で、色の切り替えは reduced-motion で止める", () => {
    expect(css).toMatch(/\.nav-item\[data-active="true"\] \.nav-icon-frame \{\s*background-color: var\(--color-accent-200\);/);
    const reducedBlock = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedBlock).toContain(".nav-icon-frame");
  });
});
