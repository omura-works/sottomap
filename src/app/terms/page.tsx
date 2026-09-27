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
 * 第4条（運営の責任）は消費者契約法8条（全部免責・故意重過失の一部免責は無効。一部免責は軽過失に限ることを
 * 条項中で明らかにする〈同条3項〉）に合わせる（指示書 r19-c-brief.md §2。消費者庁の逐条解説で確認）。
 */
export default function TermsPage() {
  return (
    <LegalPage title="利用規約" effectiveDate="施行日: 2026年9月20日（最終改定: 2026年9月23日）">
      <LegalSection heading="1. このサービスについて">
        <p className="m-0">
          そっとマップ（以下「本サービス」）は、北海道の「まだ静かな店」を、その街に住む人が地図にピンとして残し、90日ごとに「まだ静かか」を確認し続けることで、観光地化していない店の情報だけを保ち続けることを目指す地図サービスです。
        </p>
        <p className="m-0">
          店の掲載（投稿）と、掲載された店の確認（「行ったことがある」の承認）は、その店がある街に住んでいる方だけが行えます。
        </p>
      </LegalSection>

      <LegalSection heading="2. 利用者に守っていただくこと">
        <ul className="m-0 pl-5 space-y-1">
          <li>投稿する店の情報は、事実に基づくものにしてください。</li>
          <li>他の人の権利（著作権・肖像権・プライバシーなど）を侵害する投稿はしないでください。</li>
          <li>荒らし行為（嫌がらせ、事実と異なる投稿の繰り返し、不正な承認など）はしないでください。</li>
          <li>
            住んでいる街は、90日に1回までしか変更できません。（直前の変更から90日以内は変更できず、次に変更できる日を画面でお知らせします。）
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. 掲載する情報の性質">
        <p className="m-0">
          本サービスに掲載する店舗の情報は、その街に住む投稿者が確認して投稿した情報です。運営は、投稿の元になった情報を調べてはいません。混み具合などは、投稿者の申告や地元の方の確認にもとづく参考情報であり、正確性や現在の状況を保証するものではありません。
        </p>
        <p className="m-0">
          掲載されている店舗について掲載を止めてほしいというお申し出があった場合、運営は内容を確認したうえで、掲載を取り下げるかどうかを判断します。お申し出は、お問い合わせフォーム（<Link href="/contact">/contact</Link>）または
          <Link href="/shops">掲載店舗の方へ</Link>のページからお願いします。
        </p>
      </LegalSection>

      <LegalSection heading="4. 保証しないことと、運営の責任">
        <ul className="m-0 pl-5 space-y-1">
          <li>本サービスに掲載する情報の正確性・完全性・最新性は保証しません。</li>
          <li>システムの保守・不具合・障害などにより、本サービスを常時利用できることは保証しません。</li>
          <li>
            利用者どうし、または利用者と店舗とのやり取りやトラブルは、当事者の間で解決してください。ただし、運営に責任がある場合は、次の項目のとおりとします。
          </li>
          <li>
            運営の責めに帰すべき事由によって利用者に損害が生じた場合、運営はその損害を賠償します。ただし、運営に故意または重大な過失がない場合（軽過失の場合）に限り、賠償する範囲は、実際に生じた直接かつ通常の損害までとします。運営に故意または重大な過失がある場合、その他法令上責任を免れることができない場合は、この限りではありません。
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. 禁止事項に違反した場合の対応">
        <p className="m-0">
          第2条の禁止事項に違反した投稿は非公開にすることがあります。また、違反を繰り返す利用者については、本サービスの利用をお断りすることがあります。
        </p>
      </LegalSection>

      <LegalSection heading="6. この規約の変更">
        <p className="m-0">
          この規約は、必要に応じて変更することがあります。内容を変更した場合は、本サービス上でお知らせします。
        </p>
      </LegalSection>

      <LegalSection heading="7. 準拠法・管轄裁判所">
        <p className="m-0">
          この規約は日本法に準拠します。本サービスに関して利用者と運営との間で紛争が生じた場合は、札幌地方裁判所を第一審の専属的合意管轄裁判所とします。
        </p>
      </LegalSection>

      <LegalSection heading="8. お問い合わせ">
        <p className="m-0">
          この規約に関するお問い合わせは、お問い合わせフォーム（<Link href="/contact">/contact</Link>）からお願いします。運営者の表示は「そっとマップ運営」です。
        </p>
      </LegalSection>
    </LegalPage>
  );
}
