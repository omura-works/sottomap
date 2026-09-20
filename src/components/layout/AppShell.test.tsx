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

  it("チロムなしのページ（/start）ではフッターもナビも出さない", () => {
    mockPathname = "/start";
    render(<AppShell>content</AppShell>);
    expect(screen.queryByRole("link", { name: "利用規約" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "主要ナビゲーション" })).not.toBeInTheDocument();
  });
});
