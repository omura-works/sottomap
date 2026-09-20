import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
};

/**
 * /privacy プライバシーポリシー。
 * ここに書く「集めている情報」は、実装を読んで確認した項目だけに絞る（推測で書かない）。
 * 確認した実装: supabase/migrations/0001_init.sql（users/spots/bookmarks/endorsements/
 * verification_requests/contact_messages）、src/app/(auth)/auth/callback/route.ts、
 * src/components/map/geo.ts（現在地）、src/lib/supabase/server.ts（Cookie）。
 * 解析ツール（Google Analytics 等）は導入されていない（src配下に該当コードなし）。
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="プライバシーポリシー" effectiveDate="施行日: 2026年9月20日">
      <LegalSection heading="1. 集めている情報">
        <p className="m-0">
          本サービスを使うために、次の情報を集めています。ログイン（会員登録）していない状態では、
          お問い合わせフォームの送信以外に情報は集めていません。
        </p>
        <ul className="m-0 pl-5 space-y-2">
          <li>
            <strong>メールアドレス</strong>
            ：ログイン（ログイン用リンクの送付）のために使います。パスワードは使わず、メールに届くリンクを
            開くことでログインします。
          </li>
          <li>
            <strong>表示名・住んでいる街・エリア名・住んでからの年数・プロフィール画像</strong>
            ：投稿やコメントの投稿者として画面に表示するために使います。住んでいる街は、ピンを立てられる街・
            地元として確認できる街を決めるためにも使い、90日に1回までしか変更できません。
          </li>
          <li>
            <strong>灯りポイント</strong>：確認への回答などに応じて増える数値で、画面に表示します。
          </li>
          <li>
            <strong>投稿した店の情報（店名・場所・営業時間などの申告・投稿理由・訪れる頻度・写真など）</strong>
            ：地図・検索・詳細画面に表示するために使います。
          </li>
          <li>
            <strong>栞（ブックマーク）</strong>：どの店を栞に挟んだか、行く予定の日時を記録し、栞の一覧に使います。
          </li>
          <li>
            <strong>「行ったことがある」の確認（承認）・90日ごとの確認への回答</strong>
            ：店を地図に出すかどうかの判定（同じ街の2人の承認）と、静かさの状態（静かなまま／並びはじめた／もう
            観光地になった）の判定に使います。
          </li>
          <li>
            <strong>お問い合わせの内容</strong>
            ：区分（掲載を止めてほしい・内容の訂正・その他）、本文、返信用に入力した連絡先、対象の店、
            送信時のブラウザ情報（ユーザーエージェント）を、お問い合わせへの対応のために使います。
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. 現在地について">
        <p className="m-0">
          「徒歩◯分」の表示や近い順の並び替えのために、ブラウザの位置情報機能（Geolocation API）を使うことが
          あります。取得した現在地は、その端末の中（ブラウザ）だけで使い、サーバーには送っていません。
        </p>
        <p className="m-0">
          利用者自身が共有リンクに座標を含めて誰かに送った場合は、そのリンクを開いた人には、その座標が伝わります。
          本サービスが自動でURLに現在地を書き込むことはありません。
        </p>
      </LegalSection>

      <LegalSection heading="3. 保存先・配信・地図タイル">
        <ul className="m-0 pl-5 space-y-2">
          <li>
            <strong>Supabase</strong>：データベース（上記の集めている情報）と認証（ログイン）を提供する外部の
            サービスです。
          </li>
          <li>
            <strong>Vercel</strong>：本サービスの配信（ホスティング）を行う外部のサービスです。配信にあたり、
            アクセスしたIPアドレスやアクセス記録（アクセスログ）が一般的に記録されます。
          </li>
          <li>
            <strong>国土地理院の地図タイル</strong>：地図の表示に使う地図画像（タイル）を配信元から取得します。
            表示のリクエストに伴い、IPアドレスなどが配信元に渡ることがあります。
          </li>
          <li>
            <strong>メール送信サービス</strong>：ログイン用リンクを送るメールの配信に使います（本番運用では
            独自のメール配信サービスを設定します）。宛先のメールアドレスと送信内容が、そのサービスを通じて
            送られます。
          </li>
        </ul>
        <p className="m-0">解析ツール（Google Analytics など）や、広告のための計測は導入していません。</p>
      </LegalSection>

      <LegalSection heading="4. Cookie（クッキー）について">
        <p className="m-0">
          ログインした状態を保つため、認証用のセッションCookieを使います。広告や解析のためのCookieは
          使っていません。
        </p>
      </LegalSection>

      <LegalSection heading="5. 保存する期間">
        <p className="m-0">
          90日ごとの確認依頼は、届いてから90日以内に回答がない場合、さらに90日（合わせて約180日）経っても
          回答がなければ、そのピンは地図から外れます（削除はしません）。
        </p>
        <p className="m-0">
          その他の情報について、実装上決められた自動削除の期間はありません。退会やデータの削除については、
          次の「6. できること」をご覧ください。
        </p>
      </LegalSection>

      <LegalSection heading="6. 利用者ができること">
        <p className="m-0">
          退会（アカウントの削除）のご希望、登録した情報の削除・確認は、お問い合わせフォーム
          （<Link href="/contact">/contact</Link>）から申し出てください。画面上にご自身で操作できる自動の
          削除機能は、現時点ではありません。
        </p>
      </LegalSection>

      <LegalSection heading="7. 第三者への提供">
        <p className="m-0">
          法令に基づく場合を除き、集めた情報を第三者に提供することはありません。
        </p>
      </LegalSection>

      <LegalSection heading="8. お問い合わせ">
        <p className="m-0">
          このプライバシーポリシーに関するお問い合わせは、お問い合わせフォーム
          （<Link href="/contact">/contact</Link>）から、運営者「ウラスポ運営」宛にお願いします。
        </p>
      </LegalSection>
    </LegalPage>
  );
}
