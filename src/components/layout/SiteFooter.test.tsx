import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./SiteFooter";

/**
 * 指示書 pages-c-brief.md §2: フッターに並ぶリンクと既存の但し書きの検証。
 */
describe("SiteFooter", () => {
  it("利用規約・プライバシーポリシー・よくある質問・お問い合わせ・掲載店舗の方へへのリンクを持つ", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "利用規約" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "プライバシーポリシー" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "よくある質問" })).toHaveAttribute("href", "/faq");
    expect(screen.getByRole("link", { name: "お問い合わせ" })).toHaveAttribute("href", "/contact");
    expect(screen.getByRole("link", { name: "掲載店舗の方へ" })).toHaveAttribute("href", "/shops");
  });

  it("既存の但し書き（掲載情報・地図データの出典）を残す", () => {
    render(<SiteFooter />);
    expect(screen.getByText(/国土地理院/)).toBeInTheDocument();
  });

  it("本番（既定）では「架空のデータ」と書かず、デモモードのときだけ書く（R19 軽微）", () => {
    const { unmount } = render(<SiteFooter />);
    expect(screen.queryByText(/架空のデータ/)).not.toBeInTheDocument();
    expect(screen.getByText(/その街に住む投稿者が確認して投稿したもの/)).toBeInTheDocument();
    unmount();

    render(<SiteFooter demoMode />);
    expect(screen.getByText(/架空のデータ/)).toBeInTheDocument();
  });

  it("サイト名を先頭に出す（ワードマークは「そっとマップ」と1回だけ読まれる）", () => {
    render(<SiteFooter />);
    expect(screen.getAllByText("そっとマップ")).toHaveLength(1);
  });

  it("SPEC motion §5.0: 夜の帯（night-band）で、但し書きは夜の色、灯りの点は飾り", () => {
    const { container } = render(<SiteFooter />);
    expect(container.querySelector(".night-band")).not.toBeNull();
    expect(screen.getByText(/国土地理院/)).toHaveAttribute("data-tone", "night");
    const lamps = container.querySelector(".lamp-dots");
    expect(lamps).toHaveAttribute("aria-hidden", "true");
    expect(lamps?.querySelectorAll(".lamp-dot")).toHaveLength(6);
  });

  it("ページの切り替えの間は動かさない錨（view-transition-name: site-footer）", () => {
    const { container } = render(<SiteFooter />);
    expect((container.querySelector("footer") as HTMLElement).style.viewTransitionName).toBe("site-footer");
  });
});
