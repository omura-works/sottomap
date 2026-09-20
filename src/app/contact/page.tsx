import type { Metadata } from "next";
import { connection } from "next/server";
import { getSpot } from "@/lib/db/spots";
import { Disclaimer } from "@/components/profile/Disclaimer";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "お問い合わせ",
  description: "掲載停止のご依頼、内容の訂正、その他のお問い合わせの窓口です。",
};

/** `?spot=<id>` は文字列1つだけを受け取る。 */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * お問い合わせ `/contact`（SPEC §9.17）。
 * 掲載を止めてほしいという申し出を受ける窓口。内容は公開せず、運営だけが読む。
 * `?spot=<id>` が付いていれば、その店を対象として表示し、hidden で一緒に送る。
 */
export default async function ContactPage(props: PageProps<"/contact">) {
  await connection();
  const searchParams = await props.searchParams;
  const spotId = firstParam(searchParams.spot);

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
    <div className="mx-auto max-w-2xl px-4 py-6 lg:py-10 space-y-6">
      <header className="space-y-2">
        <p className="text-muted text-xs tracking-wide uppercase">窓口</p>
        <h1 style={{ fontSize: 30 }}>お問い合わせ</h1>
        <p className="text-muted">
          掲載を止めてほしい、内容が違う、そのほかのご連絡はこちらへ。いただいた内容は公開しません。
        </p>
      </header>

      <div className="space-y-2">
        <p className="text-sm m-0">返信をお約束するものではありません。</p>
        <p className="text-sm m-0">掲載停止のご連絡は、確認のうえ速やかに対応します。</p>
        <p className="text-sm text-muted m-0">
          本文には、お名前・電話番号などの個人情報は書かないでください。
        </p>
      </div>

      <ContactForm spot={spot} />

      <Disclaimer />
    </div>
  );
}
