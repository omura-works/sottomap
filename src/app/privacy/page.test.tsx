import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "./page";

describe("PrivacyPage", () => {
  it("見出しと施行日を表示する", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1, name: "プライバシーポリシー" })).toBeInTheDocument();
    expect(screen.getByText("施行日: 2026年9月20日（最終改定: 2026年9月24日）")).toBeInTheDocument();
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

  it("事実誤認を直している（R19 重要1）: 未ログインでも扱う情報を書き、実装に無い項目は書かない", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/お問い合わせフォームの送信以外に情報は集めていません/);
    expect(text).toMatch(/ログインしていなくても扱う情報/);
    expect(text).toMatch(/CSPレポート/);
    expect(text).toMatch(/クエリ文字列は記録しません/);
    expect(text).not.toMatch(/営業時間/);
    expect(text).not.toMatch(/写真/);
    expect(text).toMatch(/プロフィール画像・住んでからの年数・エリア名は、入力する画面が無く、現在は集めていません。ほかの人にも公開していません/);
    expect(text).toMatch(/最初は「地元の人」/);
  });

  it("個人情報保護法で求められる事項を書いている（R19 重要3）", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/「ウラスポ運営」が運営しています/);
    expect(text).toMatch(/氏名（名称）・住所・代表者（法人の場合）は、お問い合わせフォーム（\/contact）からご請求いただければ、遅滞なく回答します/);
    expect(text).toMatch(/安全のためにしていること/);
    expect(text).toMatch(/「自分の個人情報について」を選んで送ってください/);
    expect(text).toMatch(/手数料：無料です/);
    expect(text).toMatch(/Supabase Pte\. Ltd\.（シンガポール）/);
    expect(text).toMatch(/Vercel Inc\.（アメリカ）/);
    expect(text).toMatch(/Plus Five Five, Inc\.（アメリカ）/);
    expect(text).toMatch(/ご意見・苦情の窓口/);
  });

  it("保存期間を目的別に書き、約180日は削除ではないと区別する（R19 重要4）", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/受付から1年を過ぎたあとの日次の処理で削除します/);
    expect(text).toMatch(/24時間を過ぎたあとの日次の処理で削除します（最大でおよそ48時間）/);
    expect(text).not.toMatch(/最大24時間/);
    expect(text).not.toMatch(/受付から1年で自動的に削除します/);
    expect(text).toMatch(/退会のお申し出があるまで保存します/);
    expect(text).toMatch(/運営が手作業でアカウントを削除します/);
    expect(text).toMatch(/これは地図に出すのをやめるもので、データの削除ではありません/);
    expect(text).not.toMatch(/実装上決められた自動削除の期間はありません/);
  });

  it("ほかの人に見える情報が DB の公開範囲と一致する（R20 重要1・2）", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/誰が承認したか、誰が確認に答えたか（アカウントのID）は公開しません/);
    expect(text).toMatch(/回答の中身（静かなまま／並びはじめた／もう観光地になった）と日時/);
    expect(text).toMatch(/投稿者の表示名/);
    // 0011 で承認者のIDは非公開、0012 で確認の回答者のIDも非公開になった。両方が公開されるという旧記述は残さない。
    expect(text).not.toMatch(/承認と確認の回答は、画面では人数や結果だけを表示していますが/);
  });

  it("個人情報の請求は、ログインできない人・退会した人の経路と回答の手段を書く（R20 重要3）", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/ログインできない場合や退会した場合/);
    expect(text).toMatch(/本人確認のうえ回答します/);
    expect(text).toMatch(/個人情報の請求への回答/);
    expect(text).toMatch(/お問い合わせの記録も、請求の対象です/);
    expect(text).not.toMatch(/この区分は、ログインしていないと送れません/);
  });

  it("お問い合わせ先へのリンクを持つ", () => {
    render(<PrivacyPage />);
    expect(screen.getAllByRole("link", { name: "/contact" }).length).toBeGreaterThan(0);
  });
});
