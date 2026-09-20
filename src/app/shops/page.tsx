import Link from "next/link";
import { Card } from "@/components/ui";

/**
 * 「掲載店舗の方へ」`/shops`。
 * ウラスポは実在の店舗を本人の許可なく掲載しているサービスであるため、
 * 店主が見たときに「何をすればよいか」が1画面で分かることを目的にする
 * （指示書 `.superpowers/sdd/urasupo/pages-c-brief.md` §1、SPEC §1 の思想）。
 * `AppShell` が `main` を出すので、ここでは container だけを組む。
 */
export default function ShopsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 lg:py-10 space-y-8">
      <header className="space-y-2">
        <h1 style={{ fontSize: 30 }}>掲載店舗の方へ</h1>
        <p className="text-muted m-0">
          ウラスポに店名や場所が載っている方への、ご案内です。
        </p>
      </header>

      <section className="space-y-2">
        <h3>ウラスポがしていること</h3>
        <p className="m-0">
          ウラスポは、地元に住む人が「まだ静かな店」として地図に記録し、90日ごとに「まだ静かか」を確認し続けるサービスです。宣伝や集客を目的とはしていません。
        </p>
      </section>

      <section className="space-y-2">
        <h3>掲載している内容</h3>
        <p className="m-0">
          公開されている情報にもとづく店名・場所・短い紹介だけを載せています。写真や口コミの掲載はしていません。
        </p>
      </section>

      <Card elevation="sm">
        <h3 className="m-0">掲載を止めてほしい場合</h3>
        <p className="m-0">
          <Link href="/contact">お問い合わせ</Link>から「掲載を止めてほしい」を選んで送ってください。確認のうえ、速やかに地図から外します。費用はかかりません。
        </p>
      </Card>

      <Card elevation="sm">
        <h3 className="m-0">内容を直してほしい場合</h3>
        <p className="m-0">
          同じく<Link href="/contact">お問い合わせ</Link>からご連絡ください。
        </p>
      </Card>

      <section className="space-y-2">
        <h3>掲載を止めたあと</h3>
        <p className="m-0">一度外した店を、あとから再び載せることはありません。</p>
      </section>

      <section className="space-y-2">
        <h3>対応までの目安</h3>
        <p className="m-0">確認でき次第、対応します。自動では処理していません。</p>
      </section>
    </div>
  );
}
