import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "./page";

describe("PrivacyPage", () => {
  it("見出しと施行日を表示する", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1, name: "プライバシーポリシー" })).toBeInTheDocument();
    expect(screen.getByText("施行日: 2026年9月20日")).toBeInTheDocument();
  });

  it("現在地は端末の中だけで使い、送っていないことを書いている", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/端末の中\（ブラウザ\）だけで使い/)).toBeInTheDocument();
  });

  it("解析ツールは導入していないことを明示する", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/解析ツール（Google Analytics など）や、広告のための計測は導入していません。/)).toBeInTheDocument();
  });

  it("Cookieは認証のセッションのみであることを書いている", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/広告や解析のためのCookieは/)).toBeInTheDocument();
  });

  it("お問い合わせ先へのリンクを持つ", () => {
    render(<PrivacyPage />);
    expect(screen.getAllByRole("link", { name: "/contact" }).length).toBeGreaterThan(0);
  });
});
