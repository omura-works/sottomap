import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage from "./page";

describe("PrivacyPage", () => {
  it("見出しと施行日を表示する", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1, name: "プライバシーポリシー" })).toBeInTheDocument();
    expect(screen.getByText("施行日: 2026年9月20日（最終改定: 2026年9月25日）")).toBeInTheDocument();
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
    expect(text).toMatch(/「そっとマップ運営」が運営しています/);
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
    expect(text).toMatch(/ログインできない場合/);
    expect(text).toMatch(/退会した場合/);
    expect(text).toMatch(/本人確認のうえ回答します/);
    expect(text).toMatch(/個人情報の請求への回答/);
    expect(text).toMatch(/お問い合わせの記録も、請求の対象です/);
    expect(text).not.toMatch(/この区分は、ログインしていないと送れません/);
  });

  it("退会と本人確認を、退会で問い合わせの記録も消える実装どおりに書く（R21 重要2）", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    // 0010 の set null をやめ、0014 で requester_id は on delete cascade。IDとの結び付きを外して残す、とは書かない。
    expect(text).not.toMatch(/結び付きだけを外して/);
    expect(text).not.toMatch(/登録していた）メールアドレス/);
    expect(text).toMatch(/ログインした状態で送ったお問い合わせの記録も一緒に削除されます/);
    // ログインできない人: 返信先を登録しているメールアドレスと照合し、一致したときにそのアドレス宛に確認する。
    expect(text).toMatch(/登録しているメールアドレスと照合し、一致した場合に/);
    expect(text).toMatch(/一致しない場合は、アカウントの登録が見つからないものとして扱います/);
    // 退会した人の請求の範囲は R22 重要4 で広げた（下のテスト）。
    // ログイン中の請求では返信先を受け付けない（R21 軽微1）。
    expect(text).toMatch(/ログインした状態で個人情報について請求する場合は、返信用のメールアドレスの欄を出さず、保存しません/);
  });

  it("確認の回答では備考を集めない（R21 重要1）", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/備考/);
  });

  it("承認・確認の回答で保存する項目が DB の列と一致する（R22 重要3）", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    // verifications は spot_id・user_id・verification_request_id・answer・created_at を保存する。「だけ」と断定しない。
    expect(text).not.toMatch(/確認の回答で集めるのは、どの店への回答か、答え（静かなまま／並びはじめた／もう観光地になった）と日時だけです/);
    expect(text).toMatch(/どの店への回答か、回答したアカウントのID、どの確認の依頼への回答か（依頼のID）、答え（静かなまま／並びはじめた／もう観光地になった）、日時/);
    // endorsements は spot_id・user_id・created_at。
    expect(text).toMatch(/どの店を承認したか、承認したアカウントのID、日時/);
    // verification_requests（依頼そのもの）と lantern_events（灯りポイントの台帳）も保存している。
    expect(text).toMatch(/確認の依頼/);
    expect(text).toMatch(/増えた理由（店の公開・確認への回答）と日時の記録/);
    // 保存はするが、ほかの利用者には公開しない。
    expect(text).toMatch(/承認・回答したアカウントのIDは、ほかの利用者には公開しません/);
  });

  it("退会後に残るもの・請求の受け方・バックアップを決定事項どおりに書く（R22 重要4・軽微1）", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    // 「返信先付きの問い合わせだけ」「特定できないため請求にお応えできず」という一律の断定はしない。
    expect(text).not.toMatch(/退会したあとに請求できるのは、ログインせずに返信用のメールアドレスを書いて送ったお問い合わせについてだけです/);
    expect(text).not.toMatch(/どなたのものかを特定できないため、請求にお応えできず/);
    // 退会後に残るもの。
    // R23 軽微: 稼働中のDBには退会の記録（30日）も残る。
    expect(text).not.toMatch(/稼働中のデータベースに残るのは、ログインせずに送ったお問い合わせだけです/);
    expect(text).toMatch(/稼働中のデータベースに残るのは、ログインせずに送ったお問い合わせと、退会の記録（退会したアカウントのIDと退会の日時。退会から30日を過ぎたあとの日次の処理で削除）だけです/);
    expect(text).toMatch(/アクセスの記録・ログインの記録（Vercel・Supabase の保存期間まで）/);
    expect(text).toMatch(/バックアップ（最大30日）/);
    expect(text).toMatch(/これらも請求の対象です。特定できる範囲で対応します/);
    // 返信先の無い問い合わせも個別に判断する。
    expect(text).toMatch(/返信用のメールアドレスを書かずに送ったお問い合わせも、一律にお断りはしません/);
    expect(text).toMatch(/受付日時・内容の一部など、対象を特定できる情報/);
    expect(text).toMatch(/個別に判断して対応します/);
    // 返信先付きの問い合わせの開示では追加の確認をする。
    expect(text).toMatch(/そのアドレスで運営からの確認のメールを受け取れることに加えて、受付日時・内容の一部などもうかがって/);
    // 保存期間: バックアップ30日、退会の記録、再削除。
    expect(text).toMatch(/取得から30日を過ぎたものは運営が削除します/);
    // R23 重要2: 戻したときは、DB とは別に保管している記録をもとに削除・訂正をやり直す（稼働中のDBが読めなくても）。
    expect(text).not.toMatch(/バックアップから戻したときは、そのあいだに退会したアカウントを改めて削除します/);
    expect(text).toMatch(/バックアップから戻したときは、運営が別に保管している退会・削除の記録をもとに、改めて削除します/);
    expect(text).toMatch(/データベースとは別の場所（運営の端末の暗号化したファイル）/);
    expect(text).toMatch(/日時・対象（アカウントのID、またはお問い合わせの受付ID）・内容/);
    expect(text).toMatch(/退会したアカウントのIDと退会の日時/);
    expect(text).toMatch(/退会から30日を過ぎたあとの日次の処理で削除します/);
  });

  it("確認の依頼で保存する項目が DB の列（answered_verification_id）と一致する（R23 軽微）", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    // verification_requests は id・spot_id・user_id・due_at・created_at・status・answered_verification_id。回答日時の列は無い。
    expect(text).not.toMatch(/答えたかどうかと答えた日時/);
    expect(text).toMatch(/どの店の確認か、依頼先のアカウントのID、答える期限、答えたかどうか、答えた回答（回答のID）、依頼の日時/);
  });

  it("お問い合わせ先へのリンクを持つ", () => {
    render(<PrivacyPage />);
    expect(screen.getAllByRole("link", { name: "/contact" }).length).toBeGreaterThan(0);
  });
});
