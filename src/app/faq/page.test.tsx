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
    expect(text).toMatch(/受付から1年を過ぎたあとの日次の処理で削除します/);
    expect(text).toMatch(/ログインできない場合/);
    expect(text).toMatch(/同じ名前で近い場所への再投稿を受け付けない/);
    expect(text).not.toMatch(/確認のうえ、掲載を取り下げます/);
    expect(text).not.toMatch(/行く予定の日時をあわせて記録/);
  });

  it("退会と本人確認の答えが、プライバシーポリシーと実装（退会で問い合わせの記録も消える）に合う（R21 重要2）", () => {
    render(<FaqPage />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/退会したあとも、この期間までは残ります/);
    expect(text).not.toMatch(/登録していた）メールアドレス/);
    expect(text).toMatch(/登録しているメールアドレスと照合し/);
    expect(text).toMatch(/ログインした状態で送ったお問い合わせの記録も一緒に削除されます/);
  });

  it("退会後に残るものと請求の受け方が、プライバシーポリシーの決定事項と合う（R22 重要4）", () => {
    render(<FaqPage />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/ログインせずに返信用のメールアドレスを書いて送ったお問い合わせについてだけ/);
    expect(text).toMatch(/ログインせずに送ったお問い合わせ、アクセスの記録・ログインの記録（Vercel・Supabase の保存期間まで）、バックアップ（最大30日）/);
    expect(text).toMatch(/これらも請求の対象です/);
    expect(text).toMatch(/受付日時・内容の一部など、対象を特定できる情報/);
    expect(text).toMatch(/返信用のメールアドレスを書かずに送ったお問い合わせも、一律にお断りはせず、個別に判断して対応します/);
    expect(text).toMatch(/確認のメールを受け取れることに加えて、受付日時・内容の一部なども確かめます/);
  });

  it("すべての summary がキーボードで開閉できる（ネイティブ要素）", () => {
    render(<FaqPage />);
    const summaries = document.querySelectorAll("summary");
    summaries.forEach((summary) => {
      expect(summary.tagName).toBe("SUMMARY");
    });
  });
});
