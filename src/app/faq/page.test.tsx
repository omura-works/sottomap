import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FaqPage from "./page";

describe("FaqPage", () => {
  it("見出しを表示する", () => {
    render(<FaqPage />);
    expect(screen.getByRole("heading", { level: 1, name: "よくある質問" })).toBeInTheDocument();
  });

  it("最低15問を折りたたみ（details/summary）で並べる", () => {
    render(<FaqPage />);
    const groups = document.querySelectorAll("details");
    expect(groups.length).toBeGreaterThanOrEqual(15);
    groups.forEach((detail) => {
      expect(detail.querySelector("summary")).not.toBeNull();
    });
  });

  it("90日ごとの確認・分速80mなど実装に基づいた回答を含む", () => {
    render(<FaqPage />);
    expect(screen.getByText(/分速80メートル/)).toBeInTheDocument();
    expect(screen.getByText(/約180日/)).toBeInTheDocument();
    expect(screen.getByText(/8つの街/)).toBeInTheDocument();
  });

  it("表示名の初期値・個人情報の請求・問い合わせの保存期間・掲載停止が、プライバシーポリシー・掲載店舗の方へと食い違わない（R19）", () => {
    render(<FaqPage />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/最初は「地元の人」と表示されます/);
    expect(text).toMatch(/「自分の個人情報について」を選んで送って/);
    expect(text).toMatch(/受付から1年で自動的に削除します/);
    expect(text).toMatch(/同じ名前で近い場所への再投稿を受け付けない/);
    expect(text).not.toMatch(/確認のうえ、掲載を取り下げます/);
    expect(text).not.toMatch(/行く予定の日時をあわせて記録/);
  });

  it("すべての summary がキーボードで開閉できる（ネイティブ要素）", () => {
    render(<FaqPage />);
    const summaries = document.querySelectorAll("summary");
    summaries.forEach((summary) => {
      expect(summary.tagName).toBe("SUMMARY");
    });
  });
});
