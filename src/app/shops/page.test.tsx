import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ShopsPage from "./page";

/**
 * 指示書 pages-c-brief.md §1: 店主が見たときに何をすればよいかが1画面で分かること。
 */
describe("ShopsPage（/shops）", () => {
  it("見出しと、掲載を止める／直す導線が /contact を指す", () => {
    render(<ShopsPage />);
    expect(screen.getByRole("heading", { name: "掲載店舗の方へ", level: 1 })).toBeInTheDocument();

    const contactLinks = screen.getAllByRole("link", { name: "お問い合わせ" });
    expect(contactLinks.length).toBeGreaterThan(0);
    for (const link of contactLinks) {
      expect(link).toHaveAttribute("href", "/contact");
    }
  });

  it("宣伝・集客が目的でないこと、費用がかからないことに触れる", () => {
    render(<ShopsPage />);
    expect(screen.getByText(/宣伝や集客を目的とはしていません/)).toBeInTheDocument();
    expect(screen.getByText(/費用はかかりません/)).toBeInTheDocument();
  });

  it("約束を実態に合わせる（R19 重要7）: 投稿者が確認した情報・確認でき次第・再投稿の抑止・本人確認はしない", () => {
    render(<ShopsPage />);
    expect(screen.getByText(/投稿者が確認して投稿した/)).toBeInTheDocument();
    expect(screen.getByText(/内容を確認でき次第、地図から外すかどうかを判断します/)).toBeInTheDocument();
    expect(screen.getByText(/同じ名前で近い場所への再投稿は受け付けないようにしています/)).toBeInTheDocument();
    expect(screen.getByText(/店主ご本人かどうかの確認はしていません/)).toBeInTheDocument();
    expect(screen.queryByText(/速やかに/)).not.toBeInTheDocument();
    expect(screen.queryByText(/再び載せることはありません/)).not.toBeInTheDocument();
    expect(screen.queryByText(/公開されている情報にもとづく/)).not.toBeInTheDocument();
  });
});
