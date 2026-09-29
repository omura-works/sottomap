import Link from "next/link";
import { Card } from "@/components/ui";
import { PageTransition } from "@/components/motion/PageTransition";
import { PageLamp } from "@/components/motion/PageLamp";

/**
 * 「掲載店舗の方へ」`/shops`。
 * そっとマップは実在の店舗を本人の許可なく掲載しているサービスであるため、
 * 店主が見たときに「何をすればよいか」が1画面で分かることを目的にする
 * （指示書 `.superpowers/sdd/urasupo/pages-c-brief.md` §1、SPEC §1 の思想）。
 * 約束は実態に合わせる（r19-c-brief.md §3: 投稿元の検査はしない・店主本人の確認はしない・再投稿は
 * 掲載停止リストで同じ名前かつ100m以内を受け付けない。完全ではないので「ようにしています」）。
 * `AppShell` が `main` を出すので、ここでは container だけを組む。
 */
export default function ShopsPage() {
  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl px-4 py-6 lg:py-10 space-y-8">
        <header className="space-y-2">
          <h1 style={{ fontSize: 30 }}>
            <PageLamp />
            掲載店舗の方へ
          </h1>
          <p className="text-muted m-0">
            そっとマップに店名や場所が載っている方への、ご案内です。
          </p>
        </header>

        <section className="space-y-2">
          <h2>そっとマップがしていること</h2>
          <p className="m-0">
            そっとマップは、地元に住む人が「まだ静かな店」として地図に記録し、90日ごとに「まだ静かか」を確認し続けるサービスです。宣伝や集客を目的とはしていません。
          </p>
        </section>

        <section className="space-y-2">
          <h2>掲載している内容</h2>
          <p className="m-0">
            その街に住む投稿者が確認して投稿した、店名・場所・短い紹介だけを載せています。運営は、投稿の元になった情報を調べてはいません。写真や口コミの掲載はしていません。
          </p>
        </section>

        <Card elevation="sm">
          <h2 className="m-0">掲載を止めてほしい場合</h2>
          <p className="m-0">
            <Link href="/contact">お問い合わせ</Link>から「掲載を止めてほしい」を選んで送ってください。内容を確認でき次第、地図から外すかどうかを判断します。費用はかかりません。
          </p>
        </Card>

        <Card elevation="sm">
          <h2 className="m-0">内容を直してほしい場合</h2>
          <p className="m-0">
            同じく<Link href="/contact">お問い合わせ</Link>からご連絡ください。
          </p>
        </Card>

        <section className="space-y-2">
          <h2>掲載を止めたあと</h2>
          <p className="m-0">一度外した店は記録しておき、同じ名前で近い場所への再投稿は受け付けないようにしています。</p>
        </section>

        <section className="space-y-2">
          <h2>対応までの目安</h2>
          <p className="m-0">内容を確認でき次第、対応します。自動では処理していません。</p>
        </section>

        <section className="space-y-2">
          <h2>お申し出の確認について</h2>
          <p className="m-0">
            店主ご本人かどうかの確認はしていません。どなたからのお申し出でも、内容を確認して判断します。
          </p>
        </section>
      </div>
    </PageTransition>
  );
}
