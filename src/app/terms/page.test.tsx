import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TermsPage from "./page";

describe("TermsPage", () => {
  it("見出しと施行日を表示する", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "利用規約" })).toBeInTheDocument();
    expect(screen.getByText("施行日: 2026年9月20日")).toBeInTheDocument();
  });

  it("住んでいる街の90日制限について書いている", () => {
    render(<TermsPage />);
    expect(screen.getByText(/90日に1回までしか変更できません/)).toBeInTheDocument();
  });

  it("準拠法・管轄裁判所を明示する", () => {
    render(<TermsPage />);
    expect(screen.getByText(/日本法に準拠/)).toBeInTheDocument();
    expect(screen.getByText(/札幌地方裁判所/)).toBeInTheDocument();
  });

  it("/contact と /shops へのリンクを持つ", () => {
    render(<TermsPage />);
    expect(screen.getAllByRole("link", { name: "/contact" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "掲載店舗の方へ" })).toHaveAttribute("href", "/shops");
  });
});
