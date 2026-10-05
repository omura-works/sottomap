import type { Metadata } from "next";
import { connection } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { getSpot } from "@/lib/db/spots";
import { ContactForm } from "./ContactForm";
import { PageTransition } from "@/components/motion/PageTransition";
import { PageLamp } from "@/components/motion/PageLamp";

export const metadata: Metadata = {
  title: "お問い合わせ",
  description: "掲載停止のご依頼、内容の訂正、ご自身の個人情報について、その他のお問い合わせの窓口です。",
};

/** `?spot=<id>` は文字列1つだけを受け取る。 */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * お問い合わせ `/contact`（SPEC §9.17）。
 * 掲載を止めてほしいという申し出を受ける窓口。内容は公開せず、運営だけが読む。
 * `?spot=<id>` が付いていれば、その店を対象として表示し、hidden で一緒に送る。
 * 個人情報の請求（privacy）は、ログイン中かどうかで経路が変わる（未ログインなら返信先が必須）ため、
 * ログインしているかをフォームに渡す。
 */
export default async function ContactPage(props: PageProps<"/contact">) {
  await connection();
  const searchParams = await props.searchParams;
  const spotId = firstParam(searchParams.spot);
  const isLoggedIn = (await getCurrentUserId()) !== null;

  let spot: { id: string; name: string; cityName: string } | null = null;
  if (spotId) {
    try {
      const found = await getSpot(spotId);
      // 公開中の店だけを対象にする（DB 関数 submit_contact_message も同じ条件で検査する）。
      if (found && found.status === "published") {
        spot = { id: found.id, name: found.name, cityName: found.cityName };
      }
    } catch {
      // 壊れたIDなどは「対象なし」として扱い、問い合わせ自体は妨げない。
      spot = null;
    }
  }

  return (
    <PageTransition>
      <div className="contact-screen mx-auto max-w-2xl px-4 py-6 lg:py-10">
        <header className="contact-head">
          <p className="verify-kickers">
            <PageLamp />
            <span className="kicker-pill">窓口</span>
          </p>
          <h1 className="contact-title">お問い合わせ</h1>
          <p className="contact-lead">
            掲載を止めてほしい、内容が違う、そのほかのご連絡はこちらへ。いただいた内容は公開しません。
          </p>
        </header>

        {/* 約束と注意の3つの文（文は変えない）は紙のカードに貼る */}
        <div className="card contact-promise verb-stick keep-visible">
          <p className="text-sm m-0">
            返信をお約束するものではありません。ただし、ご自身の個人情報についての請求には、本人確認のうえ回答します。
          </p>
          <p className="text-sm m-0">掲載停止のご連絡は、内容を確認でき次第、対応します。</p>
          <p className="text-sm text-muted m-0">
            本文には、お名前・電話番号などの個人情報は書かないでください。
          </p>
        </div>

        <ContactForm spot={spot} isLoggedIn={isLoggedIn} />
      </div>
    </PageTransition>
  );
}
