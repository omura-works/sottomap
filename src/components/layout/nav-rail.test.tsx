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

// SPEC motion §4.1.1: 選ばれた丸は ::before の accent-200 が判子のように押され、右上の灯りがタブを渡る。
describe.each([
  ["サイドレール", SideRail],
  ["下部タブ", BottomNav],
] as const)("%s のナビの灯り", (_name, Nav) => {
  it("選択中の項目にだけナビの灯りがあり、飾りとして読み上げない", () => {
    mockPathname = "/sapporo/search";
    const { container } = render(<Nav />);
    const lamps = container.querySelectorAll(".nav-lamp");
    expect(lamps).toHaveLength(1);
    expect(lamps[0]).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("link", { name: "さがす" })).toContainElement(lamps[0] as HTMLElement);
  });

  it("栞の丸は、栞に挟んだリボンの行き先（data-lamp-target=bookmarks）", () => {
    mockPathname = "/sapporo";
    render(<Nav />);
    const frame = screen.getByRole("link", { name: "栞" }).querySelector(".nav-icon-frame");
    expect(frame).toHaveAttribute("data-lamp-target", "bookmarks");
    expect(document.querySelectorAll("[data-lamp-target='bookmarks']")).toHaveLength(1);
  });

  it("アイコンに data-icon を付け、待ちの輪（飾り）を各タブに持つ", () => {
    mockPathname = "/me";
    render(<Nav />);
    const me = screen.getByRole("link", { name: "自分" });
    expect(me.querySelector("svg")).toHaveAttribute("data-icon", "me");
    expect(me.querySelector(".nav-pending")).toHaveAttribute("aria-hidden", "true");
    expect(me.querySelector(".nav-pending")).toHaveAttribute("data-pending", "false");
  });

  it("ページの切り替えの錨として view-transition-name を持つ", () => {
    mockPathname = "/sapporo";
    const { container } = render(<Nav />);
    const anchor = container.querySelector("aside, nav") as HTMLElement;
    expect(anchor.style.viewTransitionName).toBe(Nav === SideRail ? "site-rail" : "site-tabs");
  });
});

describe("globals.css のナビの丸", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  it("選択中の丸は ::before の accent-200 が押されて現れ、reduce では押さない", () => {
    expect(css).toMatch(/\.nav-icon-frame::before \{[^}]*background: var\(--color-accent-200\);[^}]*opacity: 0;/);
    expect(css).toMatch(/\.nav-item\[data-active="true"\] \.nav-icon-frame::before \{\s*opacity: 1;\s*animation:\s*v-stamp-nav var\(--dur-stamp\) var\(--spring-stamp\) 120ms both/);
    // 背景色の 320ms の切り替えはやめた
    expect(css).not.toMatch(/\.nav-item\[data-active="true"\] \.nav-icon-frame \{\s*background-color/);
    const reducedBlock = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedBlock).toContain(".nav-icon-frame::before");
  });
});
