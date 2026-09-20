import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "利用規約",
};

/**
 * /terms 利用規約。
 * 事実だけを書く（推測で書かない）。ここに書く内容は SPEC §1〜§3、§9.16、実装
 * （src/app/(auth)/login, src/app/api/cron/verification/logic.ts, supabase/migrations）
 * を確認して裏付けたもの。有料サービス・返金など現在の実装に無いものは書かない。
 */
export default function TermsPage() {
  return (
    <LegalPage title="利用規約" effectiveDate="施行日: 2026年9月20日">
      <LegalSection heading="1. このサービスについて">
        <p className="m-0">
          ウラスポ（以下「本サービス」）は、北海道の「まだ静かな店」を、その街に住む人が地図にピンとして残し、
          90日ごとに「まだ静かか」を確認し続けることで、観光地化していない店の情報だけを保ち続けることを目指す
          地図サービスです。
        </p>
        <p className="m-0">
          店の掲載（投稿）と、掲載された店の確認（「行ったことがある」の承認）は、その店がある街に住んでいる方
          だけが行えます。
        </p>
      </LegalSection>

      <LegalSection heading="2. 利用者に守っていただくこと">
        <ul className="m-0 pl-5 space-y-1">
          <li>投稿する店の情報は、事実に基づくものにしてください。</li>
          <li>他の人の権利（著作権・肖像権・プライバシーなど）を侵害する投稿はしないでください。</li>
          <li>荒らし行為（嫌がらせ、事実と異なる投稿の繰り返し、不正な承認など）はしないでください。</li>
          <li>
            住んでいる街は、90日に1回までしか変更できません。
            （直前の変更から90日以内は変更できず、次に変更できる日を画面でお知らせします。）
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. 掲載する情報の性質">
        <p className="m-0">
          本サービスに掲載する店舗情報は、公開されている情報にもとづく実在の店舗についての情報です。営業時間や
          混み具合などは、投稿者の申告や地元の方の確認にもとづく参考情報であり、正確性や現在の状況を保証する
          ものではありません。
        </p>
        <p className="m-0">
          掲載されている店舗の方から掲載を止めてほしいというお申し出があった場合、運営はその掲載を取り下げます。
          お申し出は、お問い合わせフォーム（<Link href="/contact">/contact</Link>）または
          <Link href="/shops">掲載店舗の方へ</Link>のページからお願いします。
        </p>
      </LegalSection>

      <LegalSection heading="4. 免責事項">
        <ul className="m-0 pl-5 space-y-1">
          <li>本サービスに掲載する情報の正確性・完全性・最新性を保証しません。</li>
          <li>システムの保守・不具合・障害などにより、本サービスを常時利用できることを保証しません。</li>
          <li>
            利用者どうし、または利用者と店舗とのやり取り・トラブルについて、運営は関与せず、責任を負いません。
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. 禁止事項に違反した場合の対応">
        <p className="m-0">
          第2条の禁止事項に違反した投稿は非公開にすることがあります。また、違反を繰り返す利用者については、
          本サービスの利用をお断りすることがあります。
        </p>
      </LegalSection>

      <LegalSection heading="6. この規約の変更">
        <p className="m-0">
          この規約は、必要に応じて変更することがあります。内容を変更した場合は、本サービス上でお知らせします。
        </p>
      </LegalSection>

      <LegalSection heading="7. 準拠法・管轄裁判所">
        <p className="m-0">
          この規約は日本法に準拠します。本サービスに関して利用者と運営との間で紛争が生じた場合は、
          札幌地方裁判所を第一審の専属的合意管轄裁判所とします。
        </p>
      </LegalSection>

      <LegalSection heading="8. お問い合わせ">
        <p className="m-0">
          この規約に関するお問い合わせは、お問い合わせフォーム（<Link href="/contact">/contact</Link>）から
          お願いします。運営者の表示は「ウラスポ運営」です。
        </p>
      </LegalSection>
    </LegalPage>
  );
}
