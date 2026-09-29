import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

/**
 * 指示書 pages-c-brief.md §2: フッターは全ページの下に出るが、地図が画面いっぱいを
 * 占める街トップ・チロムなしのページでは出さない（`nav-items.ts` の `isFooterHidden`）。
 */
describe("AppShell のフッター表示", () => {
  it("街トップ（地図）ではフッターを出さない", () => {
    mockPathname = "/sapporo";
    render(<AppShell>content</AppShell>);
    expect(screen.queryByRole("link", { name: "利用規約" })).not.toBeInTheDocument();
  });

  it("一覧・栞・自分などの通常ページではフッターを出す", () => {
    mockPathname = "/sapporo/search";
    render(<AppShell>content</AppShell>);
    expect(screen.getByRole("link", { name: "利用規約" })).toBeInTheDocument();
  });

  it.each(["/start", "/login", "/verify/req-1"])("ナビなしのページ（%s）ではナビは出さず、フッターは出す（R19 軽微）", (path) => {
    mockPathname = path;
    render(<AppShell>content</AppShell>);
    expect(screen.getByRole("link", { name: "利用規約" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "プライバシーポリシー" })).toHaveAttribute("href", "/privacy");
    expect(screen.queryByRole("navigation", { name: "主要ナビゲーション" })).not.toBeInTheDocument();
  });

  it("但し書きの「架空のデータ」はデモモードのときだけ出す", () => {
    mockPathname = "/sapporo/search";
    const { unmount } = render(<AppShell demoMode>content</AppShell>);
    expect(screen.getByText(/架空のデータ/)).toBeInTheDocument();
    unmount();

    render(<AppShell>content</AppShell>);
    expect(screen.queryByText(/架空のデータ/)).not.toBeInTheDocument();
    expect(screen.getByText(/国土地理院/)).toBeInTheDocument();
  });

  it("ナビのある・なしが切り替わっても <main> は同じ要素のまま（/start → 地図でページの包みの出入り＝アイリスが起きるように）", () => {
    mockPathname = "/start";
    const { rerender } = render(<AppShell>content</AppShell>);
    const main = screen.getByRole("main");
    expect(screen.queryByRole("navigation", { name: "主要ナビゲーション" })).not.toBeInTheDocument();
    mockPathname = "/sapporo";
    rerender(<AppShell>content</AppShell>);
    expect(screen.getByRole("main")).toBe(main);
    expect(screen.getAllByRole("navigation", { name: "主要ナビゲーション" }).length).toBeGreaterThan(0);
  });
});

