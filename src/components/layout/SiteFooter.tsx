import Link from "next/link";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { LampDots } from "@/components/illustrations/LampDots";
import { NightRidge } from "@/components/illustrations/NightRidge";
import { Reveal } from "@/components/motion/Reveal";
import { Disclaimer } from "@/components/profile/Disclaimer";

interface FooterLink {
  label: string;
  href: string;
}

const FOOTER_LINKS: readonly FooterLink[] = [
  { label: "利用規約", href: "/terms" },
  { label: "プライバシーポリシー", href: "/privacy" },
  { label: "よくある質問", href: "/faq" },
  { label: "お問い合わせ", href: "/contact" },
  { label: "掲載店舗の方へ", href: "/shops" },
];

/** ページの切り替えの型（SPEC motion §4.2.1: フッターのリンクは page-forward）。 */
const FORWARD = ["page-forward"];

/**
 * 全ページ共通フッター（SPEC motion §5.0「夜の帯」）。山並み → 夜の帯（灯りの点6つ・ワードマーク・リンク・但し書き）。
 * サイト名 → リンク → 但し書き（Disclaimer）の順は今のまま（指示書 pages-c-brief.md §2）。
 * `AppShell` 側で S2「地図」/ D1「PC版トップ」など地図が画面いっぱいを占めるページでは
 * 出さない（`isFooterHidden` 参照）。
 * `demoMode` はサーバーの layout で `isDemoMode()` を判定して渡す（但し書きの「架空のデータ」はデモのときだけ）。
 * 灯りの点は明滅しない。画面に入ったら 45ms ずらしで1回ともる（Reveal）。
 */
export function SiteFooter({ demoMode = false }: { demoMode?: boolean }) {
  return (
    // ページの切り替えの間は動かさない錨（view-transition-name: site-footer）。前のページの画像がフッターに重ならないように
    <footer className="site-footer" style={{ viewTransitionName: "site-footer" }}>
      <NightRidge className="site-footer-ridge" />
      <div className="night-band">
        <Reveal verb="ignite" className="site-footer-lamps">
          <LampDots count={6} stepMs={45} />
        </Reveal>
        <div className="site-footer-inner">
          <BrandLockup tone="night" size={24} />
          <nav aria-label="フッターリンク">
            <ul className="site-footer-links">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} transitionTypes={FORWARD}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Disclaimer demoMode={demoMode} tone="night" />
        </div>
      </div>
    </footer>
  );
}
